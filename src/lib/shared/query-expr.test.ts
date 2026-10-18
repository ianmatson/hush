import { describe, expect, it } from 'vitest';
import { queryMatches } from './rules';
import { aboutTexts, compileExpr, parseExpr, queryError, numberMatches } from './query';
import type { Enrichment, RuleFacts } from './types';

const ME = 'ian';

function thread(over: Partial<RuleFacts> = {}, enrichment: Partial<Enrichment> = {}): RuleFacts {
	return {
		repo: 'acme/web',
		subjectType: 'PullRequest',
		title: 'Fix the login timeout',
		me: ME,
		enrichment: {
			kind: 'pr',
			author: 'alice',
			labels: ['bug'],
			assignees: [],
			reviewRequests: [],
			additions: 20,
			deletions: 10,
			...enrichment
		},
		...over
	};
}

const matches = (query: string, t: RuleFacts) => queryMatches(query, t);

describe('parseExpr', () => {
	it('keeps a plain query as one simple condition', () => {
		expect(compileExpr('repo:acme/* label:bug login').kind).toBe('match');
		expect(compileExpr('').kind).toBe('match');
		expect(compileExpr('-author:bots -is:draft').kind).toBe('match');
	});
	it('builds OR, groups, and NOT', () => {
		expect(compileExpr('label:bug OR label:crash').kind).toBe('or');
		expect(compileExpr('repo:acme/web (label:bug OR about:"a crash")').kind).toBe('and');
		expect(compileExpr('-label:wontfix').kind).toBe('not');
		expect(compileExpr('-(label:a OR label:b)').kind).toBe('not');
	});
	it('reports unbalanced parentheses and a lonely OR', () => {
		expect(parseExpr('(label:bug').errors).toContain('A “(” has no matching “)”.');
		expect(parseExpr('label:bug)').errors).toContain('A “)” has no matching “(”.');
		expect(parseExpr('label:bug OR').errors).toContain('“OR” needs a condition on both sides.');
	});
	it('reports errors inside groups', () => {
		expect(queryError('(by:alice OR label:bug)')).toBe('Use from: instead of by:.');
	});
	it('keeps quoted text with parentheses together', () => {
		expect(aboutTexts('about:"bugs (and crashes)" OR label:x')).toEqual(['bugs (and crashes)']);
	});
	it('collects about: texts from every branch', () => {
		expect(aboutTexts('about:a OR -(about:b label:x)')).toEqual(['a', 'b']);
	});
});

describe('queryMatches', () => {
	const t = thread();
	it('matches OR when either side matches', () => {
		expect(matches('label:crash OR label:bug', t)).toBe(true);
		expect(matches('label:crash OR label:docs', t)).toBe(false);
	});
	it('matches groups and NOT', () => {
		expect(matches('repo:acme/* (label:crash OR author:alice)', t)).toBe(true);
		expect(matches('repo:acme/* -(label:bug OR label:crash)', t)).toBe(false);
		expect(matches('-label:wontfix', t)).toBe(true);
		expect(matches('-repo:acme/web', t)).toBe(false);
	});
	it('negates a plain word', () => {
		expect(matches('-timeout', t)).toBe(false);
		expect(matches('-deploy', t)).toBe(true);
	});
	it('keeps the old -author:bots and -is:draft meanings', () => {
		expect(matches('-author:bots', t)).toBe(true);
		expect(matches('-is:draft', t)).toBe(true);
	});
});

describe('@me and the new words', () => {
	it('author:@me and from:@me mean you', () => {
		expect(matches('author:@me', thread({}, { author: ME }))).toBe(true);
		expect(matches('author:@me', thread())).toBe(false);
	});
	it('assignee: a login or @me', () => {
		expect(matches('assignee:@me', thread({}, { assignees: ['Ian'] }))).toBe(true);
		expect(matches('assignee:bob', thread({}, { assignees: ['bob', 'ian'] }))).toBe(true);
		expect(matches('assignee:@me', thread())).toBe(false);
	});
	it('review-requested: @me, a login, or a team', () => {
		const t = thread({}, { reviewRequests: ['ian', 'acme/web-team'] });
		expect(matches('review-requested:@me', t)).toBe(true);
		expect(matches('review-requested:acme/web-team', t)).toBe(true);
		expect(matches('review-requested:acme/*', t)).toBe(true);
		expect(matches('review-requested:bob', t)).toBe(false);
	});
	it('size: lines changed in a pull request', () => {
		expect(matches('size:<50', thread())).toBe(true);
		expect(matches('size:>50', thread())).toBe(false);
		expect(matches('size:10..30', thread())).toBe(true);
		expect(
			matches('size:<50', thread({ subjectType: 'Issue' }, { kind: 'issue', additions: undefined }))
		).toBe(false);
	});
	it('refuses a size that is not a number or range', () => {
		expect(queryError('size:small')).toMatch(/size:small/);
	});
	it('compares sizes', () => {
		expect(numberMatches('<=30', 30)).toBe(true);
		expect(numberMatches('>=31', 30)).toBe(false);
		expect(numberMatches('30', 30)).toBe(true);
	});
	it('label: takes wildcards', () => {
		const t = thread({}, { labels: ['area/api', 'Bug'] });
		expect(matches('label:area/*', t)).toBe(true);
		expect(matches('label:bu?', t)).toBe(true);
		expect(matches('label:team/*', t)).toBe(false);
	});
});

describe('bots among other values', () => {
	const bot = thread({}, { author: 'dependabot[bot]', authorIsBot: true });
	const alice = thread();
	const bob = thread({}, { author: 'bob' });

	it('author:alice,bots matches either', () => {
		expect(matches('author:alice,bots', alice)).toBe(true);
		expect(matches('author:alice,bots', bot)).toBe(true);
		expect(matches('author:alice,bots', bob)).toBe(false);
		expect(matches('author:alice author:bots', bot)).toBe(true);
	});

	it('-author:bots still means a person', () => {
		expect(matches('author:alice -author:bots', alice)).toBe(true);
		expect(matches('author:dependabot* -author:bots', bot)).toBe(false);
	});

	it('from:bob,bots matches either, and a review by a bot is from a bot', () => {
		const at = '2026-09-20T12:00:00Z';
		const reviewedBy = (author: string, authorIsBot: boolean) =>
			thread({}, { latestReview: { author, authorIsBot, at, state: 'COMMENTED' } });
		expect(matches('from:bob,bots', reviewedBy('bob', false))).toBe(true);
		expect(matches('from:bob,bots', reviewedBy('copilot-pull-request-reviewer', true))).toBe(true);
		expect(matches('from:bob,bots', reviewedBy('carol', false))).toBe(false);
		expect(matches('from:bots', reviewedBy('coderabbitai', true))).toBe(true);
	});
});
