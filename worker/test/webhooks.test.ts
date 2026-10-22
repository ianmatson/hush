import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../../src/lib/shared/durations';
import type { Env } from '../db';
import webhooks from '../routes/webhooks';
import { MAX_ROUTES_PER_DELIVERY, routeKeysOf, validSignature } from '../webhooks';
import {
	d1RouteTable,
	forgetStaleRoutes,
	MAX_ROUTED_USERS,
	routedUsers,
	ROUTE_LEASE_MS
} from '../workspace/routes';
import { sqliteD1, WEBHOOK_MIGRATION } from './d1-fixture';

const SECRET = 'test-secret';
const NOW = Date.UTC(2026, 9, 22, 12);

const fixture = (name: string) =>
	readFileSync(`worker/test/fixtures/webhooks/${name}.json`, 'utf8');

const sign = (body: string, secret = SECRET) =>
	`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

describe('routeKeysOf', () => {
	it('routes reviews, comments, and completed check suites by repository id and number', () => {
		expect(
			routeKeysOf('pull_request_review', JSON.parse(fixture('pull_request_review.submitted')))
		).toEqual(['555#16']);
		expect(routeKeysOf('issue_comment', JSON.parse(fixture('issue_comment.created')))).toEqual([
			'555#16'
		]);
		expect(routeKeysOf('check_suite', JSON.parse(fixture('check_suite.completed')))).toEqual([
			'555#16',
			'777#17'
		]);
	});

	it('ignores other events, unfinished suites, and payloads without a location', () => {
		expect(routeKeysOf('ping', JSON.parse(fixture('ping')))).toEqual([]);
		expect(
			routeKeysOf('check_suite', {
				action: 'requested',
				check_suite: { pull_requests: [{ number: 1 }] }
			})
		).toEqual([]);
		expect(routeKeysOf('issues', { action: 'opened', repository: { id: 5 } })).toEqual([]);
	});

	it('removes duplicates and keeps at most the per-delivery limit', () => {
		const pull_requests = Array.from({ length: 80 }, (_, n) => ({ number: n % 70 }));
		const keys = routeKeysOf('check_suite', {
			action: 'completed',
			repository: { id: 1 },
			check_suite: { pull_requests }
		});
		expect(keys).toHaveLength(MAX_ROUTES_PER_DELIVERY);
		expect(new Set(keys).size).toBe(keys.length);
	});
});

describe('validSignature', () => {
	const body = new TextEncoder().encode('{"a":1}').buffer as ArrayBuffer;

	it('accepts the HMAC of the exact body and refuses everything else', async () => {
		expect(await validSignature(SECRET, body, sign('{"a":1}'))).toBe(true);
		expect(await validSignature(SECRET, body, sign('{"a": 1}'))).toBe(false);
		expect(await validSignature(SECRET, body, sign('{"a":1}', 'other'))).toBe(false);
		expect(await validSignature(SECRET, body, undefined)).toBe(false);
		expect(await validSignature(SECRET, body, 'sha1=abc')).toBe(false);
	});
});

function receiver(over: Partial<Env> = {}) {
	const { d1 } = sqliteD1([WEBHOOK_MIGRATION]);
	const invalidated: [string, string[]][] = [];
	const failing = new Set<string>();
	const limited = new Set<string>();
	const env = {
		GITHUB_APP_ID: '1',
		GITHUB_WEBHOOK_SECRET: SECRET,
		DB: d1,
		WORKSPACE: {
			idFromName: (name: string) => name,
			get: (id: string) => ({
				invalidate: async (routes: string[]) => {
					if (failing.has(id)) throw new Error('gone');
					invalidated.push([id, routes]);
				}
			})
		},
		WEBHOOK_LIMIT: {
			limit: async ({ key }: { key: string }) => ({ success: !limited.has(key) })
		},
		...over
	} as unknown as Env;
	const deliver = (event: string, body: string, signature = sign(body)) =>
		webhooks.request(
			'/api/github/webhook',
			{
				method: 'POST',
				headers: { 'X-GitHub-Event': event, 'X-Hub-Signature-256': signature },
				body
			},
			env
		);
	return { d1, env, invalidated, failing, limited, deliver };
}

describe('POST /api/github/webhook', () => {
	it('is off without the app configuration', async () => {
		const r = receiver({ GITHUB_APP_ID: undefined });
		expect((await r.deliver('ping', fixture('ping'))).status).toBe(404);
	});

	it('refuses a bad signature and a body over 1 MB', async () => {
		const r = receiver();
		expect((await r.deliver('ping', fixture('ping'), sign('{}'))).status).toBe(401);
		const big = JSON.stringify({ pad: 'x'.repeat(1024 * 1024) });
		expect((await r.deliver('ping', big)).status).toBe(413);
	});

	it('invalidates each routed user once, with only their routes', async () => {
		const r = receiver();
		await d1RouteTable(r.d1, 1).apply(['555#16'], [], NOW);
		await d1RouteTable(r.d1, 2).apply(['555#16', '777#17'], [], NOW);
		await d1RouteTable(r.d1, 3).apply(['999#1'], [], NOW);
		const res = await r.deliver('check_suite', fixture('check_suite.completed'));
		expect(res.status).toBe(202);
		expect(r.invalidated.sort()).toEqual([
			['1', ['555#16']],
			['2', ['555#16', '777#17']]
		]);
	});

	it('answers 202 with no Workspace call when nobody routes the item', async () => {
		const r = receiver();
		expect((await r.deliver('issue_comment', fixture('issue_comment.created'))).status).toBe(202);
		expect(r.invalidated).toEqual([]);
	});

	it('skips users over the limit, and fails the delivery when a Workspace call fails', async () => {
		const r = receiver();
		await d1RouteTable(r.d1, 1).apply(['555#16'], [], NOW);
		await d1RouteTable(r.d1, 2).apply(['555#16'], [], NOW);
		r.limited.add('webhook:1');
		expect((await r.deliver('issue_comment', fixture('issue_comment.created'))).status).toBe(202);
		expect(r.invalidated).toEqual([['2', ['555#16']]]);
		r.failing.add('2');
		expect((await r.deliver('issue_comment', fixture('issue_comment.created'))).status).toBe(502);
	});
});

describe('route table', () => {
	it('syncs 500 routes in one batch of three statements, and lists and clears them', async () => {
		const { d1, batches } = sqliteD1([WEBHOOK_MIGRATION]);
		const table = d1RouteTable(d1, 7);
		const routes = Array.from({ length: 500 }, (_, n) => `1#${n}`);
		await table.apply(routes, [], NOW);
		expect(batches.at(-1)).toHaveLength(3);
		expect((await table.list()).sort()).toEqual([...routes].sort());
		await table.apply(['2#1'], routes.slice(1), NOW);
		expect((await table.list()).sort()).toEqual(['1#0', '2#1']);
		await table.clear();
		expect(await table.list()).toEqual([]);
	});

	it('groups users by route, up to the user limit', async () => {
		const { d1 } = sqliteD1([WEBHOOK_MIGRATION]);
		for (let user = 1; user <= MAX_ROUTED_USERS + 5; user++)
			await d1RouteTable(d1, user).apply(['1#1'], [], NOW);
		const users = await routedUsers(d1, ['1#1', '1#2']);
		expect(users.size).toBe(MAX_ROUTED_USERS);
		expect(users.get(1)).toEqual(['1#1']);
	});

	it('forgets the routes of users whose lease ran out, and keeps renewed ones', async () => {
		const { d1 } = sqliteD1([WEBHOOK_MIGRATION]);
		await d1RouteTable(d1, 1).apply(['1#1'], [], NOW - ROUTE_LEASE_MS - DAY_MS);
		await d1RouteTable(d1, 2).apply(['1#1'], [], NOW - DAY_MS);
		await forgetStaleRoutes(d1, NOW);
		expect([...(await routedUsers(d1, ['1#1'])).keys()]).toEqual([2]);
	});
});
