import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	DETAILS_TTL,
	fetchDetails,
	forTeams,
	gh,
	needsDetails,
	peekEntryFromRest,
	searchShort,
	toSubject
} from './github';
import type { SubjectFacts } from '../src/lib/shared/subject';

afterEach(() => vi.unstubAllGlobals());

const body = (init?: RequestInit) =>
	JSON.parse(String(init?.body)) as { query: string; variables: Record<string, unknown> };

describe('gh', () => {
	afterEach(() => vi.useRealTimers());

	it('leaves no timer behind once GitHub answers, so the Durable Object can sleep', async () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('{}'))
		);
		await gh('t', '/user');
		expect(vi.getTimerCount()).toBe(0);
	});

	it('gives up when GitHub does not answer', async () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			'fetch',
			vi.fn(
				(_url: string, init?: RequestInit) =>
					new Promise<Response>((_, reject) =>
						init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
					)
			)
		);
		const answer = gh('t', '/user');
		vi.runAllTimers();
		await expect(answer).rejects.toMatchObject({ name: 'TimeoutError' });
	});
});

describe('searchShort', () => {
	it('asks only for IDs and update times, and keys each hit', async () => {
		const sent: string[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init?: RequestInit) => {
				sent.push(body(init).query);
				const node = {
					__typename: 'PullRequest',
					id: 'PR_1',
					number: 7,
					updatedAt: '2026-09-02T00:00:00Z',
					repository: { nameWithOwner: 'o/r' }
				};
				return new Response(
					JSON.stringify({ data: { s0: { nodes: [node] }, s1: { nodes: [node] } } })
				);
			})
		);
		const q = [
			{ section: 'mine', q: 'is:pr author:@me' },
			{ section: 'reviewed', q: 'is:pr reviewed-by:@me' }
		];
		const r = await searchShort('t', q);
		expect(sent).toHaveLength(1);
		expect(sent[0]).not.toMatch(/statusCheckRollup|reviewThreads/);
		expect(r.hits.map((h) => [h.query.section, h.key])).toEqual([
			['mine', 'o/r#7'],
			['reviewed', 'o/r#7']
		]);
	});

	it('asks again in halves when GitHub takes too long', async () => {
		const sizes: number[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init?: RequestInit) => {
				const n = (body(init).query.match(/search\(/g) ?? []).length;
				sizes.push(n);
				if (n > 1) return new Response('', { status: 502 });
				return new Response(JSON.stringify({ data: { s0: { nodes: [] } } }));
			})
		);
		const q = Array.from({ length: 6 }, (_, i) => ({ section: 'mine', q: `is:pr q${i}` }));
		const r = await searchShort('t', q);
		expect(r.errors).toEqual([]);
		expect(sizes.filter((n) => n === 1)).toHaveLength(6);
	});

	it('says so when even one search takes too long, or gets no answer', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('', { status: 504 }))
		);
		expect((await searchShort('t', [{ section: 'm', q: 'x' }])).errors[0]).toMatch(/too long/);
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new DOMException('The operation timed out.', 'TimeoutError');
			})
		);
		expect((await searchShort('t', [{ section: 'm', q: 'x' }])).errors[0]).toMatch(
			/did not answer/
		);
	});
});

describe('fetchDetails', () => {
	it('reads the full facts by node ID, 20 in a request', async () => {
		const asked: string[][] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init?: RequestInit) => {
				const ids = body(init).variables.ids as string[];
				asked.push(ids);
				return new Response(
					JSON.stringify({
						data: {
							nodes: ids.map((id) => ({
								__typename: 'Issue',
								id,
								number: 1,
								title: 't',
								url: 'https://github.com/o/r/issues/1',
								state: 'OPEN',
								createdAt: '2026-09-01T00:00:00Z',
								updatedAt: '2026-09-02T00:00:00Z',
								repository: { nameWithOwner: 'o/r' },
								author: { login: 'alice' }
							}))
						}
					})
				);
			})
		);
		const ids = Array.from({ length: 45 }, (_, i) => `I_${i}`);
		const r = await fetchDetails('t', 'ian', ids);
		expect(asked.map((a) => a.length)).toEqual([20, 20, 5]);
		expect(r.subjects.size).toBe(45);
	});
});

const facts = (over: Partial<SubjectFacts> = {}) =>
	({
		updatedAt: '2026-09-02T00:00:00Z',
		ci: 'SUCCESS',
		reviewRequests: [],
		...over
	}) as SubjectFacts;

describe('needsDetails', () => {
	const now = Date.parse('2026-09-02T12:00:00Z');
	const recent = now - 60_000;
	it('reads again what is new, changed, running CI, old, or a full refresh', () => {
		expect(needsDetails(undefined, '2026-09-02T00:00:00Z', recent, now, false)).toBe(true);
		expect(needsDetails(facts(), '2026-09-02T01:00:00Z', recent, now, false)).toBe(true);
		expect(needsDetails(facts({ ci: 'PENDING' }), '2026-09-02T00:00:00Z', recent, now, false)).toBe(
			true
		);
		expect(needsDetails(facts(), '2026-09-02T00:00:00Z', now - DETAILS_TTL - 1, now, false)).toBe(
			true
		);
		expect(needsDetails(facts(), '2026-09-02T00:00:00Z', recent, now, true)).toBe(true);
	});
	it('keeps what Hush has for an item that did not change', () => {
		expect(needsDetails(facts(), '2026-09-02T00:00:00Z', recent, now, false)).toBe(false);
	});
});

describe('forTeams', () => {
	const q = { section: 'review-team', q: 'x', teams: ['o/web'] };
	it('keeps PRs that ask a tracked team', () => {
		expect(forTeams(q, facts({ reviewRequests: [{ team: true, name: 'O/Web' }] }), 'ian')).toBe(
			true
		);
		expect(forTeams(q, facts({ reviewRequests: [{ team: false, name: 'ian' }] }), 'ian')).toBe(
			false
		);
		expect(forTeams({ section: 'mine', q: 'x' }, facts(), 'ian')).toBe(true);
	});
	it('also keeps PRs that ask you yourself, when the search says so', () => {
		const both = { ...q, orDirect: true };
		expect(forTeams(both, facts({ reviewRequests: [{ team: false, name: 'Ian' }] }), 'ian')).toBe(
			true
		);
		expect(forTeams(both, facts({ reviewRequests: [{ team: false, name: 'bob' }] }), 'ian')).toBe(
			false
		);
		expect(
			forTeams(both, facts({ reviewRequests: [{ team: true, name: 'o/infra' }] }), 'ian')
		).toBe(false);
	});
});

describe('toSubject stack links', () => {
	const pr = (number: number, baseRefName: string, under?: Record<string, unknown>) => ({
		number,
		title: `PR ${number}`,
		url: `https://github.com/o/r/pull/${number}`,
		isDraft: false,
		baseRefName,
		author: { login: 'alice' },
		baseRef: { associatedPullRequests: { nodes: under ? [under] : [] } }
	});
	const top = (under: Record<string, unknown> | undefined, baseRefName = 'b2') => ({
		__typename: 'PullRequest',
		...pr(3, baseRefName, under),
		repository: { nameWithOwner: 'o/r', defaultBranchRef: { name: 'main' } }
	});

	it('lists the open PRs under it, nearest first, down to the default branch', () => {
		const s = toSubject(top(pr(2, 'b1', pr(1, 'main', pr(9, 'x')))));
		expect(s.stackBelowNearestFirst?.map((l) => l.number)).toEqual([2, 1]);
	});

	it('has no links for a PR on the default branch', () => {
		expect(toSubject(top(pr(2, 'b1'), 'main')).stackBelowNearestFirst).toEqual([]);
	});

	it('stops at a loop', () => {
		const s = toSubject(top(pr(2, 'b1', pr(3, 'b2'))));
		expect(s.stackBelowNearestFirst?.map((l) => l.number)).toEqual([2]);
	});
});

describe('peekEntryFromRest', () => {
	const user = {
		login: 'ann',
		avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4',
		type: 'User'
	};

	it('matches the peek timeline shape for a new comment', () => {
		expect(
			peekEntryFromRest('comment', {
				node_id: 'IC_1',
				html_url: 'https://github.com/o/r/pull/2#issuecomment-3',
				body_html: '<p>hi</p>',
				created_at: '2026-10-07T10:00:00Z',
				user
			})
		).toEqual({
			type: 'comment',
			author: {
				login: 'ann',
				avatar: 'https://avatars.githubusercontent.com/u/1?v=4&s=48',
				bot: false
			},
			at: '2026-10-07T10:00:00Z',
			url: 'https://github.com/o/r/pull/2#issuecomment-3',
			html: '<p>hi</p>',
			reactions: { id: 'IC_1', canReact: true, groups: [] }
		});
	});

	it('keeps the review state and its submit time', () => {
		const entry = peekEntryFromRest('review', {
			node_id: 'PRR_1',
			html_url: 'https://github.com/o/r/pull/2#pullrequestreview-4',
			submitted_at: '2026-10-07T11:00:00Z',
			state: 'APPROVED',
			user
		});
		expect(entry).toMatchObject({ type: 'review', state: 'APPROVED', inline: 0, html: '' });
		expect(entry.at).toBe('2026-10-07T11:00:00Z');
	});
});
