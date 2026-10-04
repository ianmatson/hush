import { describe, expect, it } from 'vitest';
import { classify, classifyDefault, ruleMatches } from './classify';
import { computeTurn, sortItems, turnFactsFromEnrichment } from './dashboard';
import {
	BODY_EXCERPT_CHARS,
	MAX_SMART_CONDITIONS,
	NO_DECISIONS,
	bodyExcerpt,
	conditionId,
	contentHash,
	forgetIdentityAnswers,
	identityHash,
	mergeDecisions,
	newCommentsForYou,
	planDecisions,
	readDecisions,
	smartConditions,
	yesOrNo,
	type StoredDecisions
} from './decisions';
import { holdReason } from './push-policy';
import { parseQuery } from './query';
import { DEFAULT_SETTINGS } from './settings';
import { validateSettings } from './settings-schema';
import { enrichmentOf, type SubjectFacts } from './subject';
import type { LastComment, Rule, Settings, ThreadFacts } from './types';

const ME = 'ian';
const T0 = '2026-09-10T00:00:00Z';
const T1 = '2026-09-11T00:00:00Z';
const T2 = '2026-09-12T00:00:00Z';

const comment = (author: string, body: string, at = T1, bot = false): LastComment => ({
	author,
	authorIsBot: bot,
	body,
	url: `https://github.com/acme/web/pull/1#${author}-${at}`,
	createdAt: at
});

function pr(over: Partial<SubjectFacts> = {}): SubjectFacts {
	return {
		id: 'PR_1',
		kind: 'pr',
		repo: 'acme/web',
		number: 1,
		title: 'Add rate limits to login',
		url: 'https://github.com/acme/web/pull/1',
		author: ME,
		authorAvatar: null,
		authorIsBot: false,
		createdAt: T0,
		updatedAt: T2,
		state: 'open',
		draft: false,
		labels: [{ name: 'security', color: 'ededed' }],
		assignees: [],
		comments: 1,
		lastComment: comment('bob', 'Thanks, looks good!', T2),
		previousComment: null,
		body: 'Adds a limit of 10 tries per minute.',
		ci: 'SUCCESS',
		reviewDecision: 'REVIEW_REQUIRED',
		mergeable: 'MERGEABLE',
		additions: 10,
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

const CHOICES = [
	{ id: 'bugs', label: 'Bugs: Defects' },
	{ id: 'other', label: 'None of these' }
];

const MIGRATIONS = { id: conditionId('database migrations'), text: 'database migrations' };

describe('conditionId', () => {
	it('is the same for the same words, whatever the case and spaces', () => {
		expect(conditionId('  Database   Migrations ')).toBe(conditionId('database migrations'));
		expect(conditionId('database migrations')).not.toBe(conditionId('docs'));
	});
});

describe('smartConditions', () => {
	it('collects each different about: text once, from enabled rules and views', () => {
		const rules: Rule[] = [
			{ when: 'about:"database migrations"', then: { category: 'action' } },
			{ when: 'repo:acme/* about:"Database migrations"', then: { push: true } },
			{ when: 'about:"docs"', enabled: false, then: { category: 'fyi' } }
		];
		const views = [{ id: 'v1', name: 'Deps', base: 'inbox' as const, query: 'about:"deps"' }];
		expect(smartConditions(rules, views).map((c) => c.id)).toEqual([
			conditionId('database migrations'),
			conditionId('deps')
		]);
	});
});

describe('bodyExcerpt', () => {
	it(`keeps the first ${BODY_EXCERPT_CHARS} characters`, () => {
		expect(bodyExcerpt('x'.repeat(BODY_EXCERPT_CHARS + 50))).toHaveLength(BODY_EXCERPT_CHARS);
		expect(bodyExcerpt(null)).toBe('');
	});
});

describe('newCommentsForYou', () => {
	it('keeps the comments by people after your own last comment', () => {
		const s = pr({
			previousComment: comment(ME, 'Can you check the limit?', T1),
			lastComment: comment('bob', 'Done, 10 per minute now.', T2)
		});
		expect(newCommentsForYou(s, ME).map((c) => c.author)).toEqual(['bob']);
	});
	it('keeps both comments when you wrote neither, and leaves out bots', () => {
		const s = pr({
			previousComment: comment('carol', 'Why 10?', T1),
			lastComment: comment('codecov[bot]', 'Coverage 90%', T2, true)
		});
		expect(newCommentsForYou(s, ME).map((c) => c.author)).toEqual(['carol']);
	});
});

describe('planDecisions', () => {
	it('asks about the comments when the newest one is by another person', () => {
		const plan = planDecisions(pr(), ME, null, []);
		expect(Object.keys(plan!.request.questions).sort()).toEqual(['reply', 'urgency']);
		expect(plan!.request.state.newCommentsForYou).toEqual([
			{ author: 'bob', body: 'Thanks, looks good!' }
		]);
		expect(plan!.request.state.you.roles).toEqual(['author']);
	});
	it('does not ask about comments by bots, by you, or when there are none', () => {
		for (const lastComment of [
			comment('renovate[bot]', 'Rebased', T2, true),
			comment(ME, 'Pushed a fix', T2),
			null
		])
			expect(
				Object.keys(planDecisions(pr({ lastComment }), ME, null, [])!.request.questions)
			).toEqual(['urgency']);
	});
	it('asks only for the about: conditions it is given', () => {
		const plan = planDecisions(pr(), ME, null, [MIGRATIONS]);
		expect(plan!.aboutIds).toEqual({ [`about_${MIGRATIONS.id}`]: MIGRATIONS.id });
		expect(plan!.request.questions[`about_${MIGRATIONS.id}`]).toMatchObject({ type: 'noul' });
	});
	it('asks nothing when the stored answers are for the same text', () => {
		const s = pr();
		const stored: StoredDecisions = {
			contentHash: contentHash(s),
			reply: 0.1,
			urgency: 0.2,
			identityHash: identityHash(s),
			about: { [MIGRATIONS.id]: 0.9 }
		};
		expect(planDecisions(s, ME, stored, [MIGRATIONS], CHOICES)).toBeNull();
	});
	it('does not ask a new condition or a new category of an item it already read', () => {
		const s = pr();
		const stored: StoredDecisions = {
			contentHash: contentHash(s),
			reply: 0.1,
			urgency: 0.2,
			identityHash: identityHash(s)
		};
		expect(planDecisions(s, ME, stored, [MIGRATIONS], CHOICES)).toBeNull();
	});
	it('asks the category and the conditions of a new item', () => {
		const plan = planDecisions(pr(), ME, null, [MIGRATIONS], CHOICES)!;
		expect(Object.keys(plan.request.questions).sort()).toEqual([
			`about_${MIGRATIONS.id}`,
			'category',
			'reply',
			'urgency'
		]);
		expect(plan.request.questions.category).toMatchObject({
			type: 'choice',
			criteria: { bugs: 'Bugs: Defects', other: 'None of these' }
		});
	});
	it('asks only the comment questions when a comment is new', () => {
		const s = pr();
		const stored: StoredDecisions = {
			contentHash: contentHash(s),
			reply: 0.1,
			urgency: 0.2,
			identityHash: identityHash(s),
			about: { [MIGRATIONS.id]: 0.9 }
		};
		const commented = pr({ lastComment: comment('bob', 'Can you add a test?', T2) });
		expect(
			Object.keys(
				planDecisions(commented, ME, stored, [MIGRATIONS], CHOICES)!.request.questions
			).sort()
		).toEqual(['reply', 'urgency']);
	});
	it('asks the category and conditions again when the title, description, or labels change', () => {
		const s = pr();
		const stored: StoredDecisions = {
			contentHash: contentHash(s),
			reply: 0.1,
			urgency: 0.2,
			identityHash: identityHash(s)
		};
		const retitled = pr({ title: 'Revert the login change' });
		expect(
			Object.keys(planDecisions(retitled, ME, stored, [MIGRATIONS], CHOICES)!.request.questions)
		).toEqual(expect.arrayContaining(['category', `about_${MIGRATIONS.id}`]));
	});
	it('does not ask again for new commits, CI, or reviews', () => {
		const s = pr();
		const stored: StoredDecisions = { contentHash: contentHash(s), reply: 0.1, urgency: 0.2 };
		const moved = pr({ ci: 'FAILURE', lastCommitAt: T2, reviewDecision: 'APPROVED' });
		expect(planDecisions(moved, ME, stored, [])).toBeNull();
	});
});

describe('readDecisions', () => {
	const s = pr();
	const answered = (over: Partial<StoredDecisions>) => ({ contentHash: contentHash(s), ...over });

	it('turns probabilities into yes, no, or unknown', () => {
		expect(yesOrNo(0.85)).toBe(true);
		expect(yesOrNo(0.1)).toBe(false);
		expect(yesOrNo(0.5)).toBeNull();
		expect(yesOrNo(undefined)).toBeNull();
	});
	it('reads the answers for the same text', () => {
		const d = readDecisions(
			answered({
				reply: 0.05,
				urgency: 1.8,
				identityHash: identityHash(s),
				about: { a: 0.95, b: 0.5, c: 0.1 },
				category: { id: 'bugs', confidence: 0.7 }
			}),
			s
		);
		expect(d).toEqual({ commentsNeedMe: false, urgent: true, smart: ['a'], category: 'bugs' });
	});
	it('ignores a category Jev was unsure about', () => {
		const d = readDecisions(
			answered({ identityHash: identityHash(s), category: { id: 'bugs', confidence: 0.4 } }),
			s
		);
		expect(d.category).toBeNull();
	});
	it('keeps the category and conditions after a new comment', () => {
		const stored = answered({
			reply: 0.05,
			identityHash: identityHash(s),
			about: { a: 0.95 },
			category: { id: 'bugs', confidence: 0.9 }
		});
		const commented = pr({ lastComment: comment('carol', 'Any news?', T2) });
		expect(readDecisions(stored, commented)).toEqual({
			commentsNeedMe: null,
			urgent: false,
			smart: ['a'],
			category: 'bugs'
		});
	});
	it('ignores answers for older text', () => {
		const old = { contentHash: 'old', reply: 0.05, urgency: 1.8, about: { a: 0.95 } };
		expect(readDecisions(old, s)).toEqual(NO_DECISIONS);
	});
});

describe('mergeDecisions', () => {
	it('keeps the identity answers when only the comments were asked again', () => {
		const s = pr();
		const stored: StoredDecisions = {
			contentHash: 'old',
			reply: 0.1,
			identityHash: identityHash(s),
			about: { [MIGRATIONS.id]: 0.9 },
			category: { id: 'bugs', confidence: 0.8 }
		};
		const plan = planDecisions(s, ME, stored, [MIGRATIONS], CHOICES)!;
		const merged = mergeDecisions(stored, plan, {
			reply: { type: 'noul', noul: 0.95 },
			urgency: { type: 'score', score: 0.3 }
		});
		expect(merged).toEqual({
			contentHash: contentHash(s),
			reply: 0.95,
			urgency: 0.3,
			identityHash: identityHash(s),
			about: { [MIGRATIONS.id]: 0.9 },
			category: { id: 'bugs', confidence: 0.8 }
		});
	});
	it('stores the category choice and the conditions of a new item', () => {
		const s = pr();
		const plan = planDecisions(s, ME, null, [MIGRATIONS], CHOICES)!;
		const merged = mergeDecisions(null, plan, {
			[`about_${MIGRATIONS.id}`]: { type: 'noul', noul: 0.1 },
			category: { type: 'choice', choice: 'bugs', confidence: 0.75 }
		});
		expect(merged).toMatchObject({
			identityHash: identityHash(s),
			about: { [MIGRATIONS.id]: 0.1 },
			category: { id: 'bugs', confidence: 0.75 }
		});
	});
	it('forgets identity answers for a re-evaluation', () => {
		const stored: StoredDecisions = {
			contentHash: 'c',
			reply: 0.1,
			identityHash: 'i',
			about: { a: 1 },
			category: { id: 'bugs', confidence: 1 }
		};
		expect(forgetIdentityAnswers(stored)).toEqual({ contentHash: 'c', reply: 0.1 });
	});
});

const noComment = { commentsNeedMe: false, urgent: false, smart: [], category: null };
const needsReply = { commentsNeedMe: true, urgent: false, smart: [], category: null };

describe('turns with comment answers', () => {
	const turnOf = (s: SubjectFacts, d = NO_DECISIONS) =>
		computeTurn(turnFactsFromEnrichment(enrichmentOf(s, ME, d), s.repo, ME), ME, [], {
			botsAreFyi: true
		});

	it('a comment on your PR that needs nothing from you is not your turn', () => {
		expect(turnOf(pr()).turn).toBe('you');
		expect(turnOf(pr(), needsReply).turn).toBe('you');
		expect(turnOf(pr(), noComment)).toMatchObject({
			turn: 'them',
			turnReason: '@bob commented, no reply needed'
		});
	});
	it('a reply on your issue that needs nothing from you is not your turn', () => {
		const issue = pr({ kind: 'issue', ci: null, lastCommitAt: null });
		expect(turnOf(issue).turn).toBe('you');
		expect(turnOf(issue, noComment)).toMatchObject({
			turn: 'them',
			turnReason: '@bob replied, no reply needed'
		});
	});
	it('an issue assigned to you stays your turn', () => {
		const issue = pr({
			kind: 'issue',
			author: 'carol',
			assignees: [ME],
			ci: null,
			lastCommitAt: null
		});
		expect(turnOf(issue, noComment)).toMatchObject({ turn: 'you', turnReason: 'Assigned to you' });
	});
});

describe('inbox classification with comment answers', () => {
	const facts = (reason: string, s: SubjectFacts, d = NO_DECISIONS): ThreadFacts => ({
		repo: s.repo,
		subjectType: s.kind === 'pr' ? 'PullRequest' : 'Issue',
		title: s.title,
		reason,
		htmlUrl: s.url,
		enrichment: enrichmentOf(s, ME, d),
		me: ME
	});
	const theirs = pr({ author: 'alice', lastComment: comment('bob', 'cc @ian', T2) });

	it('a mention that needs nothing from you is FYI', () => {
		expect(classify(facts('mention', theirs), DEFAULT_SETTINGS).category).toBe('action');
		expect(classify(facts('mention', theirs, noComment), DEFAULT_SETTINGS)).toMatchObject({
			category: 'fyi',
			summary: '@bob mentioned you (no reply needed)'
		});
	});
	it('a reply in a thread you are in that needs nothing from you is FYI', () => {
		expect(classify(facts('comment', theirs), DEFAULT_SETTINGS).category).toBe('action');
		expect(classify(facts('comment', theirs, noComment), DEFAULT_SETTINGS).category).toBe('fyi');
	});
	it('unknown answers change nothing', () => {
		const unknown = { commentsNeedMe: null, urgent: false, smart: [], category: null };
		expect(classify(facts('comment', theirs, unknown), DEFAULT_SETTINGS).category).toBe('action');
	});
});

describe('about: in rules', () => {
	const t = (smart: string[]): ThreadFacts => ({
		repo: 'acme/web',
		subjectType: 'PullRequest',
		title: 'Add a column',
		reason: 'subscribed',
		htmlUrl: 'https://github.com/acme/web/pull/1',
		enrichment: { kind: 'pr', smart },
		me: ME
	});
	const base = classifyDefault(t([]), DEFAULT_SETTINGS);
	const when = parseQuery('repo:acme/* about:"database migrations"').when;

	it('matches when Jev said yes to the condition', () => {
		expect(ruleMatches(when, t([MIGRATIONS.id]), base)).toBe(true);
		expect(ruleMatches(when, t([]), base)).toBe(false);
	});
	it('matches any of several conditions', () => {
		const either = parseQuery('about:docs,"database migrations"').when;
		expect(either.about).toEqual(['docs', 'database migrations']);
		expect(ruleMatches(either, t([MIGRATIONS.id]), base)).toBe(true);
		expect(ruleMatches(either, t([conditionId('docs')]), base)).toBe(true);
		expect(ruleMatches(either, t([conditionId('deps')]), base)).toBe(false);
	});
});

describe('about: in queries and settings', () => {
	it('parses quoted text with spaces', () => {
		expect(parseQuery('about:"database migrations, schema changes"').when.about).toEqual([
			'database migrations, schema changes'
		]);
	});
	it('refuses a condition over the length limit', () => {
		expect(parseQuery(`about:"${'x'.repeat(201)}"`).errors[0]).toMatch(/200 characters/);
	});
	it(`refuses more than ${MAX_SMART_CONDITIONS} different conditions`, () => {
		const rules: Rule[] = Array.from({ length: MAX_SMART_CONDITIONS + 1 }, (_, i) => ({
			when: `about:"topic ${i}"`,
			then: { category: 'fyi' }
		}));
		const next: Settings = { ...DEFAULT_SETTINGS, tags: [], rules };
		expect(validateSettings(next, ['rules'])).toMatch(/up to 30 different about:/);
		expect(validateSettings({ ...next, rules: rules.slice(1) }, ['rules'])).toBeNull();
	});
});

describe('urgency', () => {
	it('sorts urgent items first inside a turn group, before the waiting time', () => {
		const item = (id: string, urgent: boolean, waitingSince: string) => ({
			id,
			turn: 'you' as const,
			priority: 0,
			urgent,
			waitingSince
		});
		const sorted = sortItems([item('old', false, T0), item('urgent', true, T2)]);
		expect(sorted.map((i) => i.id)).toEqual(['urgent', 'old']);
	});
	it('lets an urgent push skip the digest and the limit, not quiet hours', () => {
		const now = Date.UTC(2026, 9, 7, 12, 0);
		const state = { recentSends: [now - 1000], lastDigestAt: now };
		const digest = { quietHours: null, pushDigestMinutes: 30, pushLimit: null };
		const limited = {
			quietHours: null,
			pushDigestMinutes: null,
			pushLimit: { count: 1, minutes: 60 }
		};
		expect(holdReason(digest, now, state)).toBe('digest');
		expect(holdReason(digest, now, state, true)).toBeNull();
		expect(holdReason(limited, now, state)).toBe('limit');
		expect(holdReason(limited, now, state, true)).toBeNull();
		const allDay = { from: 0, to: 24 * 60 - 1, weekends: true, timeZone: 'UTC' };
		expect(holdReason({ ...digest, quietHours: allDay }, now, state, true)).toBe('quiet');
	});
});
