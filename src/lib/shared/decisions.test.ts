import { describe, expect, it } from 'vitest';
import { ruleMatches } from './rules';
import { computeTurn, sortItems } from './dashboard';
import {
	BODY_EXCERPT_CHARS,
	MAX_SMART_CONDITIONS,
	NO_DECISIONS,
	bodyExcerpt,
	conditionId,
	newCommentsForYou,
	smartConditions,
	yesOrNo
} from './decisions';
import { holdReason } from './push-policy';
import { parseQuery } from './query';
import { DEFAULT_SETTINGS } from './settings';
import { MAX_CATEGORIES } from './categories';
import { validateSettings } from './settings-schema';
import { dashFactsOf, type SubjectFacts } from './subject';
import type { CategoryGroup, LastComment, RuleFacts, Settings } from './types';

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

const MIGRATIONS = { id: conditionId('database migrations'), text: 'database migrations' };

describe('conditionId', () => {
	it('is the same for the same words, whatever the case and spaces', () => {
		expect(conditionId('  Database   Migrations ')).toBe(conditionId('database migrations'));
		expect(conditionId('database migrations')).not.toBe(conditionId('docs'));
	});
});

describe('smartConditions', () => {
	it('collects each different about: text of the category rules once', () => {
		const markRules = [
			'about:"deps"',
			'about:"database migrations"',
			'repo:acme/* about:"Database migrations"'
		];
		expect(smartConditions(markRules).map((c) => c.id)).toEqual([
			conditionId('deps'),
			conditionId('database migrations')
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

describe('yesOrNo', () => {
	it('turns probabilities into yes, no, or unknown', () => {
		expect(yesOrNo(0.85)).toBe(true);
		expect(yesOrNo(0.1)).toBe(false);
		expect(yesOrNo(0.5)).toBeNull();
		expect(yesOrNo(undefined)).toBeNull();
	});
});

const noComment = { commentsNeedMe: false, urgent: false, smart: [], choices: {} };
const needsReply = { commentsNeedMe: true, urgent: false, smart: [], choices: {} };

describe('turns with comment answers', () => {
	const turnOf = (s: SubjectFacts, d = NO_DECISIONS) =>
		computeTurn(dashFactsOf(s, ME, new Set(), d), ME);

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

describe('about: in rules', () => {
	const t = (smart: string[]): RuleFacts => ({
		repo: 'acme/web',
		subjectType: 'PullRequest',
		title: 'Add a column',
		enrichment: { kind: 'pr', smart },
		me: ME
	});
	const when = parseQuery('repo:acme/* about:"database migrations"').when;

	it('matches when Jev said yes to the condition', () => {
		expect(ruleMatches(when, t([MIGRATIONS.id]))).toBe(true);
		expect(ruleMatches(when, t([]))).toBe(false);
	});
	it('matches any of several conditions', () => {
		const either = parseQuery('about:docs,"database migrations"').when;
		expect(either.about).toEqual(['docs', 'database migrations']);
		expect(ruleMatches(either, t([MIGRATIONS.id]))).toBe(true);
		expect(ruleMatches(either, t([conditionId('docs')]))).toBe(true);
		expect(ruleMatches(either, t([conditionId('deps')]))).toBe(false);
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
		const categories = Array.from({ length: MAX_SMART_CONDITIONS + 1 }, (_, i) => ({
			id: `m${i}`,
			name: `Topic ${i}`,
			color: 'gray' as const,
			rule: `about:"topic ${i}"`,
			description: ''
		}));
		const groups = (list: typeof categories): CategoryGroup[] => [
			{ id: 'a', name: 'A', categories: list.slice(0, MAX_CATEGORIES) },
			{ id: 'b', name: 'B', categories: list.slice(MAX_CATEGORIES) }
		];
		const next: Settings = { ...DEFAULT_SETTINGS, categoryGroups: groups(categories) };
		expect(validateSettings(next, ['categoryGroups'])).toMatch(/up to 30 different about:/);
		const fewer = { ...next, categoryGroups: groups(categories.slice(1)) };
		expect(validateSettings(fewer, ['categoryGroups'])).toBeNull();
		const described = categories.map((c) => ({ ...c, rule: '', description: c.name }));
		const byJev = { ...next, categoryGroups: groups(described) };
		expect(validateSettings(byJev, ['categoryGroups'])).toBeNull();
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
