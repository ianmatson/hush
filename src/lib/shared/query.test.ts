import { describe, expect, it } from 'vitest';
import { formatQuery, parseQuery } from './query';

describe('query language', () => {
	it('parses conditions and words', () => {
		expect(
			parseQuery('repo:PostHog/* kind:review -is:bot label:"good first issue" login bug')
		).toEqual({
			when: {
				repo: 'PostHog/*',
				kind: ['review'],
				bot: false,
				label: ['good first issue'],
				text: 'login bug'
			},
			errors: []
		});
	});

	it('any of several values', () => {
		expect(parseQuery('repo:a/*,b/* repo:c/d type:pr,issue').when).toEqual({
			repo: ['a/*', 'b/*', 'c/d'],
			type: ['PullRequest', 'Issue']
		});
	});

	it('knows is:', () => {
		expect(parseQuery('is:draft is:merged is:closed').when).toEqual({
			draft: true,
			state: ['merged', 'closed']
		});
	});

	it('matches option values without case, and stores the real value', () => {
		expect(parseQuery('kind:FIX_CI reason:Mention category:FYI').when).toEqual({
			reason: ['mention'],
			kind: ['fix_ci'],
			category: ['fyi']
		});
	});

	it('reports what it does not understand and leaves it out', () => {
		const q = parseQuery('foo:bar kind:nope -repo:x is:weird repo: ok');
		expect(q.when).toEqual({ text: 'ok' });
		expect(q.errors).toHaveLength(5);
		expect(q.errors[0]).toMatch(/Unknown “foo:”/);
	});

	it('round-trips', () => {
		for (const s of [
			'repo:PostHog/* author:dependabot* type:pr,ci reason:mention kind:review category:action is:open is:merged label:"good first issue" -is:bot is:draft fix login',
			'"a:b" word'
		])
			expect(formatQuery(parseQuery(s).when)).toBe(
				formatQuery(parseQuery(formatQuery(parseQuery(s).when)).when)
			);
		const when = parseQuery('label:a,b -is:draft x').when;
		expect(parseQuery(formatQuery(when)).when).toEqual(when);
		expect(formatQuery({})).toBe('');
	});
});
