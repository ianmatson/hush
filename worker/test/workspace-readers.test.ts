import { afterEach, describe, expect, it, vi } from 'vitest';
import { NOW } from '../../src/lib/model/testing';
import type { SourceSpec } from '../../src/lib/model/types';
import { fetchItems, type SearchHit } from '../github';
import { readNotifications, readSources } from '../workspace/readers';
import { initialSync } from '../workspace/work';

afterEach(() => vi.unstubAllGlobals());

const spec = (id: string, adapter: SourceSpec['adapter'] = 'search'): SourceSpec => ({
	id,
	adapter,
	kind: 'pr',
	query: adapter === 'board' ? 'project:PostHog/7 status:Doing' : `is:pr ${id}`
});

const answer = (hits: SearchHit[], failed: string[] = []) => ({
	hits,
	errors: failed.length ? ['Search timed out'] : [],
	failedSections: new Set(failed),
	failedQueries: []
});

const hit = (section: string, id: string, updatedAt = '2026-10-22T10:00:00Z'): SearchHit => ({
	query: { section, q: '' },
	id,
	key: `PostHog/posthog#${id.slice(3)}`,
	updatedAt
});

describe('readSources', () => {
	it('gives each source its own window, and a failed search its own failure', async () => {
		const result = await readSources('t', [spec('a'), spec('b'), spec('c', 'board')], () => NOW, {
			search: async () =>
				answer([hit('a', 'PR_1'), hit('a', 'PR_1', '2026-10-22T11:00:00Z')], ['b']),
			board: async () => answer([hit('c', 'PR_2')])
		});
		expect(result.reads.get('a')).toEqual({
			outcome: 'ok',
			window: {
				at: NOW,
				candidates: [{ id: 'PR_1', updatedAt: '2026-10-22T11:00:00Z' }],
				truncated: false
			}
		});
		expect(result.reads.get('b')).toEqual({ outcome: 'failed', error: 'Search timed out' });
		expect(result.reads.get('c')).toMatchObject({
			outcome: 'ok',
			window: { candidates: [{ id: 'PR_2' }] }
		});
	});

	it('marks a full page of results as truncated', async () => {
		const hits = Array.from({ length: 100 }, (_, i) => hit('a', `PR_${i}`));
		const result = await readSources('t', [spec('a')], () => NOW, {
			search: async () => answer(hits),
			board: async () => answer([])
		});
		expect(result.reads.get('a')).toMatchObject({ window: { truncated: true } });
	});
});

describe('fetchItems', () => {
	it('tells deleted or forbidden items apart from failed reads', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				Response.json({
					data: {
						nodes: [
							{ id: 'I_1', __typename: 'Issue' },
							null,
							{ id: 'PR_3', __typename: 'PullRequest', labels: null }
						]
					},
					errors: [
						{ message: 'Could not resolve', type: 'NOT_FOUND', path: ['nodes', 1] },
						{ message: 'Labels failed', path: ['nodes', 2, 'labels'] }
					]
				})
			)
		);
		const result = await fetchItems('t', 'ian', ['I_1', 'I_2', 'PR_3']);
		expect(result.read.map((s) => s.id)).toEqual(['I_1']);
		expect(result.inaccessible).toEqual(['I_2']);
		expect(result.failed).toEqual(['PR_3']);
	});

	it('marks every item as failed when GitHub does not answer', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('busy', { status: 503 }))
		);
		const result = await fetchItems('t', 'ian', ['I_1']);
		expect(result).toMatchObject({ read: [], inaccessible: [], failed: ['I_1'] });
	});
});

describe('readNotifications', () => {
	const cursor = { ...initialSync(NOW).notifications, initialized: true, lastModified: 'Wed' };

	it('asks only for changes, and maps a 304 and a 401', async () => {
		const asked: (string | null)[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init?: RequestInit) => {
				asked.push(new Headers(init?.headers).get('If-Modified-Since'));
				return new Response(null, { status: 304, headers: { 'X-Poll-Interval': '60' } });
			})
		);
		expect(await readNotifications('t', cursor)).toEqual({
			status: 'not-modified',
			pollIntervalMs: 60_000
		});
		expect(asked).toEqual(['Wed']);
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('{}', { status: 401 }))
		);
		expect(await readNotifications('t', cursor)).toEqual({ status: 'unauthorized' });
	});

	it('keeps only pull request and issue threads', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				Response.json(
					[
						{
							id: '1',
							updated_at: '2026-10-22T10:00:00Z',
							subject: {
								type: 'PullRequest',
								url: 'https://api.github.com/repos/PostHog/posthog/pulls/5'
							},
							repository: { full_name: 'PostHog/posthog' }
						},
						{
							id: '2',
							updated_at: '2026-10-22T10:00:00Z',
							subject: {
								type: 'Release',
								url: 'https://api.github.com/repos/PostHog/posthog/releases/9'
							},
							repository: { full_name: 'PostHog/posthog' }
						}
					],
					{ headers: { 'Last-Modified': 'Thu', 'X-Poll-Interval': '90' } }
				)
			)
		);
		expect(await readNotifications('t', cursor)).toEqual({
			status: 'ok',
			pollIntervalMs: 90_000,
			lastModified: 'Thu',
			threads: [
				{
					id: '1',
					updatedAt: '2026-10-22T10:00:00Z',
					repo: 'PostHog/posthog',
					number: 5,
					kind: 'pr'
				}
			]
		});
	});
});
