import { afterEach, describe, expect, it, vi } from 'vitest';
import { NOW } from '../../src/lib/model/testing';
import type { SourceSpec } from '../../src/lib/model/types';
import { CallBudget, fetchItems, type SearchHit } from '../github';
import { githubReaders, readNotifications, readSources } from '../workspace/readers';
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
		const result = await readSources(
			't',
			[spec('a'), spec('b'), spec('c', 'board')],
			new CallBudget(10),
			{
				search: async () =>
					answer([hit('a', 'PR_1'), hit('a', 'PR_1', '2026-10-22T11:00:00Z')], ['b']),
				board: async () => answer([hit('c', 'PR_2')])
			}
		);
		expect(result.get('a')).toEqual({
			outcome: 'ok',
			window: {
				candidates: [{ id: 'PR_1', updatedAt: '2026-10-22T11:00:00Z' }],
				truncated: false
			}
		});
		expect(result.get('b')).toEqual({ outcome: 'failed', error: 'Search timed out' });
		expect(result.get('c')).toMatchObject({
			outcome: 'ok',
			window: { candidates: [{ id: 'PR_2' }] }
		});
	});

	it('marks a full page of results as truncated', async () => {
		const hits = Array.from({ length: 100 }, (_, i) => hit('a', `PR_${i}`));
		const result = await readSources('t', [spec('a')], new CallBudget(10), {
			search: async () => answer(hits),
			board: async () => answer([])
		});
		expect(result.get('a')).toMatchObject({ window: { truncated: true } });
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

describe('call budget', () => {
	it('stops at a rate limit and keeps its deadline', async () => {
		const calls = vi.fn(
			async () => new Response('slow down', { status: 429, headers: { 'Retry-After': '3600' } })
		);
		vi.stubGlobal('fetch', calls);
		const budget = new CallBudget(10);
		const ids = Array.from({ length: 60 }, (_, i) => `I_${i}`);
		const result = await fetchItems('t', 'ian', ids, budget);
		expect(result.failed).toHaveLength(60);
		expect(budget.retryAt).toBeGreaterThan(Date.now());
		expect(calls.mock.calls.length).toBeLessThan(3);
	});

	it('bounds retries of a request GitHub keeps timing out', async () => {
		const calls = vi.fn(async () => new Response('bad gateway', { status: 502 }));
		vi.stubGlobal('fetch', calls);
		const ids = Array.from({ length: 40 }, (_, i) => `I_${i}`);
		await fetchItems('t', 'ian', ids, new CallBudget(8));
		expect(calls.mock.calls.length).toBeLessThanOrEqual(8);
	});
});

describe('board sources', () => {
	it('drops a board GitHub says is gone at once, and keeps a board that only failed', async () => {
		const board = spec('b', 'board');
		const result = await readSources('t', [board], new CallBudget(10), {
			search: async () => answer([]),
			board: async () => ({ ...answer([], ['b']), errors: ['Could not resolve'] })
		});
		expect(result.get('b')).toEqual({ outcome: 'gone', error: 'Could not resolve' });
		const retryable = await readSources('t', [board], new CallBudget(10), {
			search: async () => answer([]),
			board: async () => ({
				...answer([], ['b']),
				failedQueries: [{ section: 'b', q: board.query }]
			})
		});
		expect(retryable.get('b')).toMatchObject({ outcome: 'failed' });
	});

	it('takes truncation from the board page, not from the filtered rows', async () => {
		const result = await readSources('t', [spec('b', 'board')], new CallBudget(10), {
			search: async () => answer([]),
			board: async () => ({ ...answer([hit('b', 'PR_1')]), truncatedSections: new Set(['b']) })
		});
		expect(result.get('b')).toMatchObject({ window: { truncated: true } });
	});
});

describe('githubReaders', () => {
	it('reports no teams when the team request throws, so other work goes on', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Promise.reject(new Error('timeout')))
		);
		const readers = githubReaders(async () => ({ token: 't', me: 'ian' }));
		expect(await readers.teams(new CallBudget(5))).toBeNull();
	});
});

describe('GraphQL rate limits in a 200 answer', () => {
	it('stops at a RATE_LIMITED error or an empty quota', async () => {
		const reset = Math.floor(Date.now() / 1000) + 600;
		const calls = vi.fn(async () =>
			Response.json(
				{ data: null, errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }] },
				{ headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(reset) } }
			)
		);
		vi.stubGlobal('fetch', calls);
		const budget = new CallBudget(10);
		await fetchItems(
			't',
			'ian',
			Array.from({ length: 60 }, (_, i) => `I_${i}`),
			budget
		);
		expect(calls.mock.calls).toHaveLength(1);
		expect(budget.retryAt).toBe(reset * 1000);
	});
});
