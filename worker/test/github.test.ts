import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	DETAILS_TTL,
	failedWriteStatus,
	fetchDetails,
	fetchTeams,
	fetchPeek,
	fetchPeekOlder,
	fetchSubjects,
	forTeams,
	gh,
	graphql,
	graphqlFailure,
	graphqlWriteFailure,
	listNotifications,
	needsDetails,
	peekEntryFromRest,
	rateLimitRetryAt,
	refusal,
	restWriteFailure,
	searchShort,
	SUBJECT_FIELDS,
	toSubject
} from '../github';
import type { SubjectFacts } from '../../src/lib/shared/subject';
import { tokenHelp } from '../../src/lib/token-help';
import { vapidFromEnv } from '../webpush';

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

	it('gives up when the body stops arriving', async () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async (_url: string, init?: RequestInit) =>
					new Response(
						new ReadableStream({
							start(controller) {
								controller.enqueue(new TextEncoder().encode('{"data":'));
								init?.signal?.addEventListener('abort', () =>
									controller.error(init.signal!.reason)
								);
							}
						})
					)
			)
		);
		const answer = graphql('t', 'query { viewer { login } }', {});
		const settled = expect(answer).rejects.toMatchObject({ name: 'TimeoutError' });
		await vi.runAllTimersAsync();
		await settled;
		expect(vi.getTimerCount()).toBe(0);
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
	it('does not replace subject facts from a partial node while retaining other complete nodes', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				Response.json({
					data: {
						nodes: [
							{ id: 'PR_1', __typename: 'PullRequest', labels: null },
							{ id: 'I_2', __typename: 'Issue' }
						]
					},
					errors: [{ message: 'Labels failed', path: ['nodes', 0, 'labels'] }]
				})
			)
		);
		const result = await fetchDetails('t', 'ian', ['PR_1', 'I_2']);
		expect(result.subjects.has('PR_1')).toBe(false);
		expect(result.subjects.has('I_2')).toBe(true);
		expect(result.errors).toEqual(['Labels failed']);
	});

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

describe('notification rate limits', () => {
	const now = Date.parse('2026-10-17T12:00:00Z');
	const resetAt = now + 45 * 60_000;
	const headers = (values: Record<string, string>) => new Headers(values);

	it('waits for Retry-After on a secondary rate limit', () => {
		expect(
			rateLimitRetryAt(
				headers({
					'Retry-After': '60',
					'X-RateLimit-Remaining': '4000',
					'X-RateLimit-Reset': String(resetAt / 1000)
				}),
				now
			)
		).toBe(now + 60_000);
	});

	it('waits for the reset only when the quota is used up', () => {
		expect(
			rateLimitRetryAt(
				headers({ 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(resetAt / 1000) }),
				now
			)
		).toBe(resetAt);
	});

	it('does not wait on a 403 that is not a rate limit', () => {
		expect(
			rateLimitRetryAt(
				headers({ 'X-RateLimit-Remaining': '4999', 'X-RateLimit-Reset': String(resetAt / 1000) }),
				now
			)
		).toBeUndefined();
	});

	it('fails the whole read and keeps the old checkpoint when a later page fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(
					Response.json([], {
						headers: {
							'Last-Modified': 'new',
							Link: '<https://api.github.com/notifications?page=2>; rel="next"'
						}
					})
				)
				.mockResolvedValueOnce(
					new Response('{}', { status: 429, headers: { 'Retry-After': '120' } })
				)
		);
		const page = await listNotifications('t', { ifModifiedSince: 'old' });
		expect(page).toMatchObject({ status: 429, items: [], lastModified: null });
		expect(page.retryAt).toBeGreaterThan(Date.now());
	});

	it('reports the Retry-After time with the notification page', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response('{}', {
						status: 403,
						headers: { 'Retry-After': '120', 'X-RateLimit-Remaining': '10' }
					})
			)
		);
		const before = Date.now();
		const page = await listNotifications('t', {});
		expect(page.retryAt).toBeGreaterThanOrEqual(before + 120_000);
		expect(page.retryAt).toBeLessThanOrEqual(Date.now() + 120_000);
	});
});

describe('subject reads with partial GraphQL responses', () => {
	it.each(['FORBIDDEN', 'NOT_FOUND'])(
		'does not acknowledge a batch after a pathless %s error',
		async (type) => {
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => Response.json({ errors: [{ message: 'Unavailable', type }] }))
			);
			const refs = [1, 2].map((number) => ({ key: 'n' + number, owner: 'o', repo: 'r', number }));
			const reads = await fetchSubjects('t', refs, 'ian');
			expect(reads.deletedOrNoAccess.size).toBe(0);
		}
	);
	it('marks a definitively missing subject as unavailable instead of retryable', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ data: { t0: { issueOrPullRequest: null } } }))
		);
		const reads = await fetchSubjects(
			't',
			[{ key: 'n1', owner: 'o', repo: 'r', number: 1 }],
			'ian'
		);
		expect(reads.deletedOrNoAccess).toEqual(new Set(['n1']));
		expect(reads.githubDidNotAnswer.size).toBe(0);
	});
	it.each([403, 500])(
		'reports every subject of a chunk that GitHub refused with %i',
		async (status) => {
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => Response.json({ message: 'Refused' }, { status }))
			);
			const refs = [1, 2].map((number) => ({ key: 'n' + number, owner: 'o', repo: 'r', number }));
			const reads = await fetchSubjects('t', refs, 'ian');
			expect(reads.subjects.size).toBe(0);
			expect(reads.githubDidNotAnswer).toEqual(new Set(['n1', 'n2']));
			expect(reads.errors).toEqual([`GitHub returned ${status}.`]);
		}
	);
	it('reads a timed-out chunk again in halves and keeps the half that answered', async () => {
		const asked: number[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init?: RequestInit) => {
				const numbers = Object.entries(body(init).variables)
					.filter(([name]) => /^n\d+$/.test(name))
					.map(([, value]) => value as number);
				asked.push(numbers.length);
				if (numbers.length > 1 || numbers[0] === 2) return new Response('', { status: 502 });
				return Response.json({
					data: {
						t0: {
							issueOrPullRequest: {
								__typename: 'Issue',
								id: 'I_1',
								number: 1,
								repository: { nameWithOwner: 'o/r' }
							}
						}
					}
				});
			})
		);
		const refs = [1, 2].map((number) => ({ key: 'n' + number, owner: 'o', repo: 'r', number }));
		const reads = await fetchSubjects('t', refs, 'ian');
		expect(asked).toEqual([2, 1, 1]);
		expect([...reads.subjects.keys()]).toEqual(['n1']);
		expect(reads.githubDidNotAnswer).toEqual(new Set(['n2']));
	});
	it('does not store partial facts from an aliased recheck or notification read', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				Response.json({
					data: {
						t0: {
							issueOrPullRequest: { id: 'PR_1', __typename: 'PullRequest', reviewRequests: null }
						},
						t1: { issueOrPullRequest: { id: 'I_2', __typename: 'Issue' } }
					},
					errors: [
						{
							message: 'Review requests failed',
							path: ['t0', 'issueOrPullRequest', 'reviewRequests']
						}
					]
				})
			)
		);
		const result = await fetchSubjects(
			't',
			[
				{ key: 'pr', owner: 'o', repo: 'r', number: 1 },
				{ key: 'issue', owner: 'o', repo: 'r', number: 2 }
			],
			'ian'
		);
		expect(result.subjects.has('pr')).toBe(false);
		expect(result.subjects.has('issue')).toBe(true);
	});

	it('opens a partial peek without storing its incomplete subject facts', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				Response.json({
					data: {
						repository: {
							issueOrPullRequest: { id: 'PR_1', __typename: 'PullRequest', labels: null }
						}
					},
					errors: [
						{ message: 'Labels failed', path: ['repository', 'issueOrPullRequest', 'labels'] }
					]
				})
			)
		);
		const result = await fetchPeek('t', 'ian', 'o', 'r', 1);
		expect(result?.peek.can.id).toBe('PR_1');
		expect(result?.subject).toBeNull();
	});
});

describe('peek timeline pages', () => {
	const comment = (id: string) => ({ __typename: 'IssueComment', id, body: id, bodyHTML: id });
	const answer = (pageInfo: { hasPreviousPage: boolean; startCursor: string | null }) =>
		vi.fn(async (_url: string, _init: RequestInit) =>
			Response.json({
				data: {
					repository: {
						issueOrPullRequest: {
							id: 'subject_1',
							__typename: 'Issue',
							timelineItems: { totalCount: 30, pageInfo, nodes: [comment('c_1')] }
						}
					}
				}
			})
		);

	it('gives the cursor of the page before the newest items', async () => {
		vi.stubGlobal('fetch', answer({ hasPreviousPage: true, startCursor: 'Y3Vyc29y' }));
		const result = await fetchPeek('t', 'ian', 'o', 'r', 1);
		expect(result?.peek.timeline).toMatchObject({ total: 30, before: 'Y3Vyc29y' });
	});

	it('gives no cursor at the first item', async () => {
		vi.stubGlobal('fetch', answer({ hasPreviousPage: false, startCursor: 'Y3Vyc29y' }));
		const result = await fetchPeek('t', 'ian', 'o', 'r', 1);
		expect(result?.peek.timeline.before).toBeNull();
	});

	it('asks for the items before a cursor', async () => {
		const fetch = answer({ hasPreviousPage: true, startCursor: 'b2xkZXI=' });
		vi.stubGlobal('fetch', fetch);
		const page = await fetchPeekOlder('t', 'o', 'r', 1, 'Y3Vyc29y');
		expect(page).toEqual({ items: [expect.objectContaining({ id: 'c_1' })], before: 'b2xkZXI=' });
		const sent = JSON.parse(String(fetch.mock.calls[0][1].body));
		expect(sent.variables).toMatchObject({ o: 'o', r: 'r', n: 1, before: 'Y3Vyc29y' });
		expect(sent.query).toContain('before: $before');
	});
});

describe('peek head branch', () => {
	const openPr = {
		id: 'PR_1',
		__typename: 'PullRequest',
		number: 1,
		state: 'OPEN',
		headRefName: 'ian/feature',
		baseRefName: 'main',
		headRepository: { nameWithOwner: 'o/r' },
		repository: {
			nameWithOwner: 'o/r',
			defaultBranchRef: { name: 'main' },
			deleteBranchOnMerge: false
		}
	};
	const gitHub = (branchWalk: () => Response) =>
		vi.fn(async (url: string, init?: RequestInit) => {
			if (url.includes('/stacks')) return Response.json([]);
			if (body(init).query.includes('pullRequests(baseRefName')) return branchWalk();
			return Response.json({ data: { repository: { issueOrPullRequest: openPr } } });
		});

	it('offers to delete a branch that no open PR is built on', async () => {
		vi.stubGlobal(
			'fetch',
			gitHub(() => Response.json({ data: { repository: { pullRequests: { nodes: [] } } } }))
		);
		const result = await fetchPeek('t', 'ian', 'o', 'r', 1);
		expect(result?.peek.can.pr?.headBranchDeletable).toBe(true);
	});

	it('does not offer it when Hush could not read the PRs built on the branch', async () => {
		vi.stubGlobal(
			'fetch',
			gitHub(() => Response.json({ message: 'Server Error' }, { status: 500 }))
		);
		const result = await fetchPeek('t', 'ian', 'o', 'r', 1);
		expect(result?.peek.can.pr?.headBranchDeletable).toBe(false);
	});
});

describe('peek labels and assignees', () => {
	it('shows every applied label, past the ten that the stored facts keep', async () => {
		const labels = Array.from({ length: 12 }, (_, i) => ({ name: `label-${i}`, color: 'ededed' }));
		const fetchMock = vi.fn(async () =>
			Response.json({
				data: {
					repository: {
						issueOrPullRequest: {
							id: 'I_1',
							__typename: 'Issue',
							labels: { nodes: labels.slice(0, 10) },
							peekLabels: { nodes: labels },
							assignees: { nodes: [{ login: 'ada', avatarUrl: 'https://a', __typename: 'User' }] }
						}
					}
				}
			})
		);
		vi.stubGlobal('fetch', fetchMock);
		const result = await fetchPeek('t', 'ian', 'o', 'r', 1);
		expect(result?.peek.labels).toHaveLength(12);
		expect(result?.peek.assignees).toEqual([{ login: 'ada', avatar: 'https://a', bot: false }]);
		const query = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).query as string;
		expect(query).toContain('peekLabels: labels(first: 100)');
	});
});

describe('peek comment editing permissions', () => {
	it.each(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED'])(
		'does not permit editing %s reviews without body text',
		async (state) => {
			const bodies = [undefined, null, '', ' \n\t ', 'Looks good.'];
			const entries = bodies.map((body, i) => ({
				__typename: 'PullRequestReview',
				id: `review_${i}`,
				state,
				body,
				viewerDidAuthor: true,
				viewerCanUpdate: true,
				comments: { totalCount: 2 }
			}));
			vi.stubGlobal(
				'fetch',
				vi.fn(async () =>
					Response.json({
						data: {
							repository: {
								issueOrPullRequest: {
									id: 'subject_1',
									__typename: 'PullRequest',
									timelineItems: { nodes: entries, totalCount: entries.length }
								}
							}
						}
					})
				)
			);
			const result = await fetchPeek('t', 'ian', 'o', 'r', 1);
			expect(result?.peek.timeline.items.map((entry) => entry.canEdit)).toEqual([
				false,
				false,
				false,
				false,
				true
			]);
			expect(result?.peek.timeline.items.map((entry) => entry.inline)).toEqual([2, 2, 2, 2, 2]);
		}
	);

	it.each(['Issue', 'PullRequest'])(
		'keeps Markdown and only permits owned editable entries on a %s',
		async (type) => {
			const entries = [
				{ __typename: 'IssueComment', viewerDidAuthor: true, viewerCanUpdate: true },
				{ __typename: 'IssueComment', viewerDidAuthor: false, viewerCanUpdate: true },
				{ __typename: 'IssueComment', viewerDidAuthor: true, viewerCanUpdate: false },
				{ __typename: 'PullRequestReview', viewerDidAuthor: true, viewerCanUpdate: true }
			].map((entry, i) => ({
				...entry,
				id: `entry_${i}`,
				body: '**Markdown**',
				bodyHTML: '<strong>Markdown</strong>'
			}));
			vi.stubGlobal(
				'fetch',
				vi.fn(async () =>
					Response.json({
						data: {
							repository: {
								issueOrPullRequest: {
									id: 'subject_1',
									__typename: type,
									timelineItems: { nodes: entries, totalCount: entries.length }
								}
							}
						}
					})
				)
			);
			const result = await fetchPeek('t', 'ian', 'o', 'r', 1);
			expect(result?.peek.timeline.items.map((entry) => entry.canEdit)).toEqual([
				true,
				false,
				false,
				true
			]);
			expect(result?.peek.timeline.items.every((entry) => entry.body === '**Markdown**')).toBe(
				true
			);
		}
	);
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
		expect(toSubject(top(pr(2, 'b1'), 'main'), 'ian').stackBelowNearestFirst).toEqual([]);
	});

	it('stops at a loop', () => {
		const s = toSubject(top(pr(2, 'b1', pr(3, 'b2'))), 'ian');
		expect(s.stackBelowNearestFirst?.map((l) => l.number)).toEqual([2]);
	});
});

describe('toSubject close facts', () => {
	const CLOSED_AT = '2026-10-13T10:00:00Z';
	const node = (over: Record<string, unknown>) => ({
		number: 5,
		url: 'https://github.com/o/r/issues/5',
		repository: { nameWithOwner: 'o/r' },
		author: { login: 'alice' },
		...over
	});
	const issue = (state: string, stateReason: string | null) =>
		toSubject(node({ __typename: 'Issue', state, stateReason, closedAt: CLOSED_AT }), 'ian');

	it('reads when a pull request or an issue closed', () => {
		const merged = node({
			__typename: 'PullRequest',
			state: 'MERGED',
			merged: true,
			closedAt: CLOSED_AT
		});
		expect(toSubject(merged, 'ian')).toMatchObject({
			state: 'merged',
			closedAt: CLOSED_AT,
			closeReason: null
		});
		expect(
			toSubject(node({ __typename: 'Issue', state: 'OPEN', closedAt: null }), 'ian').closedAt
		).toBe(null);
	});

	it('reads why an issue closed', () => {
		expect(issue('CLOSED', 'COMPLETED').closeReason).toBe('completed');
		expect(issue('CLOSED', 'NOT_PLANNED').closeReason).toBe('not_planned');
		expect(issue('CLOSED', 'DUPLICATE').closeReason).toBe('duplicate');
		expect(issue('CLOSED', null).closeReason).toBeNull();
		expect(issue('OPEN', 'REOPENED').closeReason).toBeNull();
	});
});

describe('toSubject mentions', () => {
	const EARLY = '2026-10-05T14:14:28Z';
	const LATE = '2026-10-05T14:14:29Z';
	const node = (over: Record<string, unknown>) =>
		toSubject(
			{
				__typename: 'PullRequest',
				number: 7,
				url: 'https://github.com/o/r/pull/7',
				state: 'OPEN',
				repository: { nameWithOwner: 'o/r' },
				author: { login: 'alice' },
				createdAt: EARLY,
				...over
			},
			'ian'
		);
	const mentioned = (login: string, createdAt: string) => ({ createdAt, actor: { login } });
	const comment = (login: string, bodyText: string, createdAt: string) => ({
		author: { login },
		bodyText,
		createdAt,
		url: 'https://github.com/o/r/pull/7#c'
	});

	it('keeps when you were last mentioned, even when one comment mentions others after you', () => {
		const s = node({
			mentionEvents: {
				nodes: [mentioned('Ian', EARLY), mentioned('smallbrownbike', LATE), mentioned('joe', LATE)]
			}
		});
		expect(s.mentionedAt).toBe(EARLY);
		expect(node({ mentionEvents: { nodes: [mentioned('joe', LATE)] } }).mentionedAt).toBeNull();
	});

	it('keeps the newest time each team was written by someone else', () => {
		const s = node({
			bodyText: 'cc @Acme/Web',
			comments: {
				nodes: [
					comment('bob', '@acme/web and @acme/infra please look', LATE),
					comment('ian', '@acme/docs fyi', LATE),
					{
						...comment('github-actions', '@acme/bots', LATE),
						author: { login: 'github-actions', __typename: 'Bot' }
					}
				]
			}
		});
		expect(s.teamMentions).toEqual([
			{ team: 'acme/web', at: LATE },
			{ team: 'acme/infra', at: LATE }
		]);
	});
});

describe('toSubject reviews', () => {
	const AT = '2026-10-13T10:00:00Z';
	const reviewBy = (author: Record<string, unknown>) =>
		toSubject(
			{
				__typename: 'PullRequest',
				number: 7,
				url: 'https://github.com/o/r/pull/7',
				state: 'OPEN',
				repository: { nameWithOwner: 'o/r' },
				author: { login: 'alice' },
				latestReview: { nodes: [{ author, submittedAt: AT, state: 'COMMENTED' }] }
			},
			'ian'
		).latestReview;

	it('marks a review by a GitHub App as a bot review', () => {
		expect(reviewBy({ login: 'copilot-pull-request-reviewer', __typename: 'Bot' })).toEqual({
			author: 'copilot-pull-request-reviewer',
			authorIsBot: true,
			at: AT,
			state: 'COMMENTED'
		});
		expect(reviewBy({ login: 'bob', __typename: 'User' })?.authorIsBot).toBe(false);
	});

	it('asks only for submitted reviews, so a pending review hides no submitted one', () => {
		const reviewArguments = SUBJECT_FIELDS.match(/reviews\([^)]*\)/g) ?? [];
		expect(reviewArguments).toHaveLength(2);
		for (const args of reviewArguments)
			expect(args).toContain('states: [APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED]');
		expect(SUBJECT_FIELDS).toMatch(
			/latestReview: reviews\([^)]*\) \{ nodes \{ author \{ login __typename \}/
		);
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
				body: 'hi',
				created_at: '2026-10-07T10:00:00Z',
				user
			})
		).toEqual({
			type: 'comment',
			id: 'IC_1',
			author: {
				login: 'ann',
				avatar: 'https://avatars.githubusercontent.com/u/1?v=4&s=48',
				bot: false
			},
			at: '2026-10-07T10:00:00Z',
			url: 'https://github.com/o/r/pull/2#issuecomment-3',
			html: '<p>hi</p>',
			body: 'hi',
			canEdit: true,
			canUpdate: true,
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
		expect(entry).toMatchObject({
			type: 'review',
			id: 'PRR_1',
			state: 'APPROVED',
			inline: 0,
			html: ''
		});
		expect(entry.at).toBe('2026-10-07T11:00:00Z');
	});
});

describe('tokenHelp', () => {
	it('explains an org that blocks classic tokens', () => {
		const h = tokenHelp(
			'`acme` forbids access via a personal access token (classic). Please use a GitHub App, OAuth App, or a personal access token with fine-grained permissions.'
		);
		expect(h?.title).toBe('acme blocks classic tokens');
	});
	it('explains an org that has not approved the OAuth app', () => {
		const h = tokenHelp(
			'Although you appear to have the correct authorization credentials, the `acme` organization has enabled OAuth App access restrictions, meaning that data access to third-parties is limited.'
		);
		expect(h?.title).toBe('acme has not approved Hush');
	});
	it('ignores other errors', () => {
		expect(tokenHelp('Something else')).toBeNull();
	});
});

describe('vapidFromEnv', () => {
	it('uses the app URL when no contact is set', () => {
		const env = { VAPID_PUBLIC_KEY: 'p', VAPID_PRIVATE_KEY: 'k' };
		expect(vapidFromEnv(env, 'https://hush.example').subject).toBe('https://hush.example');
		expect(vapidFromEnv({ ...env, VAPID_SUBJECT: 'mailto:a@b.c' }, 'https://x').subject).toBe(
			'mailto:a@b.c'
		);
	});
});

describe('graphql', () => {
	it('returns the data and the GraphQL errors, without throwing', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				Response.json({ data: { a: 1 }, errors: [{ message: 'Partial', path: ['b'] }] })
			)
		);
		expect(await graphql('t', 'query { a b }', {})).toEqual({
			ok: true,
			status: 200,
			data: { a: 1 },
			errors: [{ message: 'Partial', path: ['b'] }]
		});
	});

	it('keeps the status of a failure that has no readable answer', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('Bad gateway', { status: 502 }))
		);
		expect(await graphql('t', 'query { a }', {})).toEqual({
			ok: false,
			status: 502,
			data: undefined,
			errors: []
		});
	});

	it('throws when a successful answer cannot be read, as when GitHub does not answer', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('not json'))
		);
		await expect(graphql('t', 'query { a }', {})).rejects.toThrow('GitHub did not answer.');
	});
});

describe('GitHub failures', () => {
	const result = (ok: boolean, status: number, messages: string[] = []) => ({
		ok,
		status,
		errors: messages.map((message) => ({ message }))
	});

	it('gives the first GraphQL error, else the status, else nothing', () => {
		expect(graphqlFailure(result(true, 200, ['First', 'Second']))).toBe('First');
		expect(graphqlFailure(result(false, 401))).toBe('GitHub returned 401.');
		expect(graphqlFailure(result(true, 200))).toBeNull();
	});

	it('answers 422 when GitHub refuses a write and 502 when GitHub fails', () => {
		expect(failedWriteStatus(403)).toBe(422);
		expect(failedWriteStatus(422)).toBe(422);
		expect(failedWriteStatus(502)).toBe(502);
		expect(graphqlWriteFailure(result(true, 200, ['Locked']))).toEqual({
			error: 'Locked',
			status: 422
		});
		expect(graphqlWriteFailure(null)).toEqual({ error: 'GitHub did not answer.', status: 502 });
		expect(graphqlWriteFailure(result(true, 200))).toBeNull();
	});

	it('reads the reason of a REST refusal as one sentence', async () => {
		expect(
			await refusal(
				Response.json(
					{ message: 'Validation Failed', errors: [{ message: 'Line is outside the diff' }, 'x'] },
					{ status: 422 }
				)
			)
		).toBe('Validation Failed: Line is outside the diff: x');
		expect(await refusal(new Response('', { status: 500 }))).toBe('GitHub returned 500.');
		expect(await restWriteFailure(null)).toEqual({ error: 'GitHub did not answer.', status: 502 });
	});
});

describe('fetchTeams', () => {
	it('reports a partial answer as a failure, so the complete cached teams stay', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				Response.json({
					data: {
						viewer: {
							organizations: {
								nodes: [
									{ login: 'acme', teams: { nodes: [{ combinedSlug: 'acme/web', name: 'Web' }] } },
									{ login: 'other', teams: null }
								]
							}
						}
					},
					errors: [{ message: 'Timeout', path: ['viewer', 'organizations', 'nodes', 1, 'teams'] }]
				})
			)
		);
		expect((await fetchTeams('t', 'ian')).error).toBe('Timeout');
	});
});
