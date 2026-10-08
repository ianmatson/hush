import { describe, expect, it } from 'vitest';
import { classify } from './classify';
import { computeTurn, type DashFacts } from './dashboard';
import { DEFAULT_SETTINGS } from './settings';
import type { Enrichment, Reason, Settings } from './types';

/**
 * The inbox and the dashboards must agree about a PR or issue: "Needs you" exactly when it is
 * "Your turn". Each case builds the same subject both ways and checks both answers.
 */
const ME = 'ian';
const T0 = '2026-09-10T00:00:00Z';
const T1 = '2026-09-11T00:00:00Z';
const T2 = '2026-09-12T00:00:00Z';

interface Subject {
	kind?: 'pr' | 'issue';
	author?: string;
	authorIsBot?: boolean;
	state?: 'open' | 'closed' | 'merged';
	draft?: boolean;
	assignedToMe?: boolean;
	lastComment?: { by: string; at: string; bot?: boolean } | null;
	ci?: Enrichment['ci'];
	reviewDecision?: Enrichment['reviewDecision'];
	mergeable?: Enrichment['mergeable'];
	lastCommitAt?: string | null;
	requestedMe?: boolean;
	myReview?: { at: string; state: string } | null;
	openThreads?: number;
	lastVerdict?: { by: string; at: string } | null;
}

function both(s: Subject, reason: Reason = 'subscribed', settings: Partial<Settings> = {}) {
	const kind = s.kind ?? 'pr';
	const url = `https://github.com/o/r/${kind === 'pr' ? 'pull' : 'issues'}/1`;
	const e: Enrichment = {
		kind,
		number: 1,
		url,
		state: s.state ?? 'open',
		draft: s.draft ?? false,
		author: s.author ?? 'alice',
		authorIsBot: s.authorIsBot ?? false,
		assignedToMe: s.assignedToMe ?? false,
		lastComment: s.lastComment
			? {
					author: s.lastComment.by,
					authorIsBot: !!s.lastComment.bot,
					body: '',
					url: `${url}#c`,
					createdAt: s.lastComment.at
				}
			: null,
		ci: s.ci ?? 'SUCCESS',
		reviewDecision: s.reviewDecision ?? 'REVIEW_REQUIRED',
		mergeable: s.mergeable ?? 'MERGEABLE',
		lastCommitAt: s.lastCommitAt ?? T0,
		reviewRequestedFromMe: s.requestedMe ?? false,
		requestedTeams: [],
		myReview: s.myReview ?? null,
		openThreads: s.openThreads ?? 0,
		lastVerdict: s.lastVerdict ?? null
	};
	const d: DashFacts = {
		id: 'x',
		kind,
		number: 1,
		title: 't',
		url,
		repo: 'o/r',
		author: e.author!,
		authorAvatar: null,
		authorIsBot: e.authorIsBot!,
		createdAt: T0,
		updatedAt: T2,
		state: e.state!,
		draft: e.draft!,
		labels: [],
		comments: s.lastComment ? 1 : 0,
		lastCommentBy: s.lastComment?.by ?? null,
		lastCommentAt: s.lastComment?.at ?? null,
		lastCommentIsBot: !!s.lastComment?.bot,
		assignees: s.assignedToMe ? [ME] : [],
		ci: e.ci!,
		reviewDecision: e.reviewDecision!,
		mergeable: e.mergeable!,
		additions: 1,
		deletions: 1,
		requestedMe: e.reviewRequestedFromMe!,
		requestedTeams: [],
		requestedAt: null,
		myLastReviewAt: s.myReview?.at ?? null,
		myLastReviewState: s.myReview?.state ?? null,
		openThreads: s.openThreads ?? 0,
		lastVerdictBy: s.lastVerdict?.by ?? null,
		lastVerdictAt: s.lastVerdict?.at ?? null,
		lastCommitAt: e.lastCommitAt!
	};
	const all = { ...DEFAULT_SETTINGS, ...settings };
	const inbox = classify(
		{
			repo: 'o/r',
			subjectType: kind === 'pr' ? 'PullRequest' : 'Issue',
			title: 't',
			reason,
			htmlUrl: url,
			enrichment: e,
			me: ME
		},
		all
	);
	const dash = computeTurn(d, ME, [], {
		botsAreFyi: all.botsAreFyi,
		reviewResolution: all.reviewResolution,
		newCommitsAfterReview: all.newCommitsAfterReview
	});
	return { inbox, dash };
}

const agree = (r: ReturnType<typeof both>) =>
	expect(r.inbox.category === 'action').toBe(r.dash.turn === 'you');

describe('inbox and dashboards agree (the audit cases)', () => {
	it('your draft PR with failing CI is not your turn anywhere', () => {
		const r = both({ author: ME, draft: true, ci: 'FAILURE' }, 'author');
		expect(r.dash.turn).toBe('none');
		expect(r.inbox.category).toBe('fyi');
	});

	it('new commits since your review is your turn in both', () => {
		const r = both({ myReview: { at: T0, state: 'COMMENTED' }, lastCommitAt: T1 });
		expect(r.dash.turn).toBe('you');
		expect(r.inbox).toMatchObject({ category: 'action', kind: 'review' });
	});

	it('a bot PR that asks for your review by name needs you in both, also while bots are FYI', () => {
		const r = both({ author: 'dependabot[bot]', authorIsBot: true, requestedMe: true });
		expect(r.dash.turn).toBe('you');
		expect(r.inbox).toMatchObject({ category: 'action', kind: 'review' });
		const noRequest = both({ author: 'dependabot[bot]', authorIsBot: true }, 'subscribed');
		expect(noRequest.dash.turn).toBe('none');
		expect(noRequest.inbox.category).toBe('fyi');
		const off = both(
			{ author: 'dependabot[bot]', authorIsBot: true, requestedMe: true },
			'review_requested',
			{
				botsAreFyi: false
			}
		);
		expect(off.dash.turn).toBe('you');
		expect(off.inbox.kind).toBe('review');
	});

	it('an assigned PR is your turn, whatever the notification reason', () => {
		const r = both({ assignedToMe: true }, 'comment');
		expect(r.dash.turn).toBe('you');
		expect(r.inbox).toMatchObject({ category: 'action', kind: 'triage' });
	});

	it('a comment on your PR from before your latest push is not your turn', () => {
		const r = both({ author: ME, lastComment: { by: 'bob', at: T0 }, lastCommitAt: T1 }, 'comment');
		expect(r.dash.turn).toBe('them');
		expect(r.inbox.category).toBe('fyi');
	});
});

describe('inbox and dashboards agree (open threads, any review)', () => {
	it('your approved PR with open review threads is your turn: reply first', () => {
		const r = both({ author: ME, reviewDecision: 'APPROVED', openThreads: 2 }, 'author');
		expect(r.dash).toMatchObject({ turn: 'you', turnReason: '2 open threads' });
		expect(r.inbox).toMatchObject({ category: 'action', kind: 'reply' });
		expect(r.inbox.summary).toBe('Approved, but 2 review threads are open');
	});

	it('someone else’s verdict after the last push settles a request under "any review"', () => {
		const s: Subject = { requestedMe: true, lastCommitAt: T0, lastVerdict: { by: 'bob', at: T1 } };
		const strict = both(s, 'review_requested');
		expect(strict.dash.turn).toBe('you');
		expect(strict.inbox.category).toBe('action');
		const any = both(s, 'review_requested', { reviewResolution: 'any_review' });
		expect(any.dash).toMatchObject({ turn: 'them', turnReason: '@bob reviewed' });
		expect(any.inbox.category).toBe('fyi');
	});

	it('a verdict from before the last push does not settle it', () => {
		const s: Subject = { requestedMe: true, lastCommitAt: T2, lastVerdict: { by: 'bob', at: T1 } };
		const any = both(s, 'review_requested', { reviewResolution: 'any_review' });
		expect(any.dash.turn).toBe('you');
		expect(any.inbox.category).toBe('action');
	});
});

describe('inbox and dashboards agree (new commits after your review)', () => {
	const afterReview = (state: string): Subject => ({
		myReview: { at: T0, state },
		lastCommitAt: T1
	});

	it('new commits after any review are your turn by default', () => {
		const r = both(afterReview('APPROVED'));
		expect(r.dash).toMatchObject({ turn: 'you', turnReason: 'New commits since your review' });
		expect(r.inbox).toMatchObject({ category: 'action', kind: 'review' });
	});

	it('"changes_requested": new commits after an approval wait on others', () => {
		const r = both(afterReview('APPROVED'), 'subscribed', {
			newCommitsAfterReview: 'changes_requested'
		});
		expect(r.dash).toMatchObject({ turn: 'them', turnReason: 'You approved' });
		expect(r.inbox.category).toBe('fyi');
	});

	it('"changes_requested": new commits after a comment wait on the author', () => {
		const r = both(afterReview('COMMENTED'), 'subscribed', {
			newCommitsAfterReview: 'changes_requested'
		});
		expect(r.dash).toMatchObject({ turn: 'them', turnReason: 'Waiting on author' });
		expect(r.inbox.category).toBe('fyi');
	});

	it('"changes_requested": new commits after you requested changes are your turn', () => {
		const r = both(afterReview('CHANGES_REQUESTED'), 'subscribed', {
			newCommitsAfterReview: 'changes_requested'
		});
		expect(r.dash.turn).toBe('you');
		expect(r.inbox.category).toBe('action');
	});

	it('"never": new commits are not your turn, but a new review request is', () => {
		const never = { newCommitsAfterReview: 'never' } as const;
		const pushed = both(afterReview('CHANGES_REQUESTED'), 'subscribed', never);
		expect(pushed.dash.turn).toBe('them');
		expect(pushed.inbox.category).toBe('fyi');
		const asked = both(
			{ ...afterReview('APPROVED'), requestedMe: true },
			'review_requested',
			never
		);
		expect(asked.dash).toMatchObject({ turn: 'you', turnReason: 'Re-review requested' });
		expect(asked.inbox.category).toBe('action');
	});

	for (const newCommitsAfterReview of ['always', 'changes_requested', 'never'] as const)
		for (const state of ['APPROVED', 'COMMENTED', 'CHANGES_REQUESTED'])
			for (const reason of ['subscribed', 'review_requested', 'state_change'] as const)
				it(`${newCommitsAfterReview} after ${state} (${reason})`, () =>
					agree(both(afterReview(state), reason, { newCommitsAfterReview })));
});

describe('inbox and dashboards agree (every state)', () => {
	const people = [
		{ author: ME },
		{ author: 'alice' },
		{ author: 'alice', requestedMe: true },
		{ author: 'alice', requestedMe: true, myReview: { at: T0, state: 'APPROVED' } },
		{ author: 'alice', myReview: { at: T0, state: 'APPROVED' }, lastCommitAt: T1 },
		{ author: 'alice', myReview: { at: T2, state: 'APPROVED' }, lastCommitAt: T1 },
		{ author: 'alice', assignedToMe: true },
		{ author: 'alice', requestedMe: true, lastVerdict: { by: 'bob', at: T2 } }
	];
	const states: Subject[] = [
		{},
		{ ci: 'FAILURE' },
		{ ci: 'PENDING' },
		{ reviewDecision: 'CHANGES_REQUESTED' },
		{ reviewDecision: 'APPROVED' },
		{ reviewDecision: 'APPROVED', openThreads: 1 },
		{ mergeable: 'CONFLICTING' },
		{ draft: true },
		{ state: 'merged' },
		{ state: 'closed' },
		{ lastComment: { by: 'bob', at: T2 } },
		{ lastComment: { by: ME, at: T2 } },
		{ lastComment: { by: 'bot[bot]', at: T2, bot: true } }
	];
	// "comment" and "mention" are left out on purpose: those notifications can make a thread you
	// commented in need a reply, which the dashboards cannot know.
	const reasons: Reason[] = ['author', 'review_requested', 'assign', 'subscribed', 'state_change'];

	for (const reviewResolution of ['strict', 'any_review'] as const)
		for (const kind of ['pr', 'issue'] as const)
			for (const p of people)
				for (const st of states)
					for (const reason of reasons) {
						const s = { kind, ...p, ...st };
						it(`${reviewResolution} ${kind} ${JSON.stringify(s)} (${reason})`, () =>
							agree(both(s, reason, { reviewResolution })));
					}
});
