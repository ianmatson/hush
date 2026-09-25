import { describe, expect, it } from 'vitest';
import { computeTurn, turnFactsFromEnrichment } from './dashboard';
import {
	dashFactsOf,
	enrichmentOf,
	lastVerdictOf,
	subjectKey,
	subjectKeyOfUrl,
	subjectUrls,
	type SubjectFacts
} from './subject';

const ME = 'ian';
const T0 = '2026-09-10T00:00:00Z';
const T1 = '2026-09-11T00:00:00Z';
const T2 = '2026-09-12T00:00:00Z';

function pr(over: Partial<SubjectFacts> = {}): SubjectFacts {
	return {
		id: 'PR_1',
		kind: 'pr',
		repo: 'PostHog/posthog.com',
		number: 1,
		title: 'Fix it',
		url: 'https://github.com/PostHog/posthog.com/pull/1',
		author: 'alice',
		authorAvatar: null,
		authorIsBot: false,
		createdAt: T0,
		updatedAt: T2,
		state: 'open',
		draft: false,
		labels: [{ name: 'website', color: 'ededed' }],
		assignees: [],
		comments: 0,
		lastComment: null,
		ci: 'SUCCESS',
		reviewDecision: 'REVIEW_REQUIRED',
		mergeable: 'MERGEABLE',
		additions: 2,
		deletions: 1,
		lastCommitAt: T0,
		reviewRequests: [],
		requestEvents: [],
		myReview: null,
		latestReview: null,
		verdicts: [],
		openThreads: 0,
		...over
	};
}

describe('subject keys', () => {
	it('reads both URL forms and gives both back', () => {
		expect(subjectKeyOfUrl('https://github.com/o/r/pull/12/files')).toBe('o/r#12');
		expect(subjectKeyOfUrl('https://github.com/o/r/issues/3#issuecomment-1')).toBe('o/r#3');
		expect(subjectKeyOfUrl('https://github.com/o/r/actions/runs/1')).toBeNull();
		expect(subjectUrls(subjectKey('o/r', 12))).toEqual([
			'https://github.com/o/r/pull/12',
			'https://github.com/o/r/issues/12'
		]);
	});
});

describe('views of one subject', () => {
	it('the verdict skips you and the author, and counts only approvals and change requests', () => {
		const s = pr({
			verdicts: [
				{ by: 'ian', at: T2, state: 'APPROVED' },
				{ by: 'alice', at: T2, state: 'APPROVED' },
				{ by: 'bob', at: T1, state: 'CHANGES_REQUESTED' },
				{ by: 'carol', at: T2, state: 'COMMENTED' }
			]
		});
		expect(lastVerdictOf(s, ME)).toEqual({ by: 'bob', at: T1 });
	});

	it('the inbox gets your request, short team slugs, and your review', () => {
		const e = enrichmentOf(
			pr({
				reviewRequests: [
					{ team: false, name: 'Ian' },
					{ team: true, name: 'PostHog/website' }
				],
				myReview: { at: T1, state: 'COMMENTED' },
				assignees: ['IAN']
			}),
			ME
		);
		expect(e).toMatchObject({
			reviewRequestedFromMe: true,
			requestedTeams: ['website'],
			myReview: { at: T1, state: 'COMMENTED' },
			assignedToMe: true,
			labels: ['website']
		});
	});

	it('the dashboards count only your teams, and wait since the request for you', () => {
		const s = pr({
			reviewRequests: [
				{ team: true, name: 'PostHog/website' },
				{ team: true, name: 'PostHog/other' }
			],
			requestEvents: [
				{ at: T0, team: true, name: 'PostHog/website' },
				{ at: T1, team: true, name: 'PostHog/other' }
			]
		});
		const d = dashFactsOf(s, ME, new Set(['PostHog/website']));
		expect(d.requestedTeams).toEqual(['PostHog/website']);
		expect(d.requestedAt).toBe(T0);
		expect(dashFactsOf(s, ME, new Set()).requestedAt).toBeNull();
	});

	it('an issue keeps only issue facts in the inbox', () => {
		const e = enrichmentOf(
			pr({ kind: 'issue', state: 'closed', url: 'https://github.com/o/r/issues/1' }),
			ME
		);
		expect(e.state).toBe('closed');
		expect(e).not.toHaveProperty('ci');
		expect(e).not.toHaveProperty('reviewRequestedFromMe');
	});
});

describe('the inbox and the dashboards agree about one stored subject', () => {
	const teams = ['PostHog/website'];
	const cases: [string, Partial<SubjectFacts>][] = [
		['review requested', { reviewRequests: [{ team: false, name: ME }] }],
		[
			're-review requested',
			{ reviewRequests: [{ team: false, name: ME }], myReview: { at: T0, state: 'COMMENTED' } }
		],
		['team request', { reviewRequests: [{ team: true, name: 'PostHog/website' }] }],
		['closed', { state: 'closed', reviewRequests: [{ team: false, name: ME }] }],
		['merged', { state: 'merged' }],
		['my PR, CI failed', { author: ME, ci: 'FAILURE' }],
		['my PR, changes requested', { author: ME, reviewDecision: 'CHANGES_REQUESTED' }],
		['my PR, approved', { author: ME, reviewDecision: 'APPROVED' }],
		[
			'my PR, approved with open threads',
			{ author: ME, reviewDecision: 'APPROVED', openThreads: 2 }
		],
		['my PR, conflicts', { author: ME, mergeable: 'CONFLICTING' }],
		['new commits since my review', { myReview: { at: T0, state: 'APPROVED' }, lastCommitAt: T1 }],
		['draft', { draft: true, reviewRequests: [{ team: false, name: ME }] }],
		[
			'someone replied on my PR',
			{
				author: ME,
				comments: 1,
				lastComment: { author: 'bob', authorIsBot: false, body: '', url: 'u', createdAt: T1 }
			}
		],
		['assigned issue', { kind: 'issue', assignees: [ME] }]
	];
	for (const [name, over] of cases)
		for (const reviewResolution of ['strict', 'any_review'] as const)
			it(`${name} (${reviewResolution})`, () => {
				const s = pr({
					...over,
					verdicts: [{ by: 'bob', at: T2, state: 'APPROVED' }],
					url:
						over.kind === 'issue'
							? 'https://github.com/PostHog/posthog.com/issues/1'
							: 'https://github.com/PostHog/posthog.com/pull/1'
				});
				const opts = { botsAreFyi: true, reviewResolution };
				const dash = computeTurn(dashFactsOf(s, ME, new Set(teams)), ME, [], opts);
				const inbox = computeTurn(
					turnFactsFromEnrichment(enrichmentOf(s, ME), s.repo, ME, teams),
					ME,
					[],
					opts
				);
				expect(inbox.turn).toBe(dash.turn);
				expect(inbox.kind).toBe(dash.kind);
				expect(inbox.summary).toBe(dash.summary);
			});
});
