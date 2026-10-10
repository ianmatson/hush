import { describe, expect, it } from 'vitest';
import { formatQuery, parseQuery, suggest } from './query';

describe('query language', () => {
	it('parses conditions and words', () => {
		expect(
			parseQuery('repo:acme/* type:pr -author:bots label:"good first issue" login bug')
		).toEqual({
			when: {
				repo: 'acme/*',
				type: ['PullRequest'],
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

	it('knows is:, author:bots, and from:', () => {
		expect(parseQuery('is:draft is:merged is:closed').when).toEqual({
			draft: true,
			state: ['merged', 'closed']
		});
		expect(parseQuery('author:bots from:github-actions,vercel* -from:bots').when).toEqual({
			bot: true,
			by: ['github-actions', 'vercel*'],
			byBot: false
		});
	});

	it('names the new word for an old one', () => {
		expect(parseQuery('by:alice').errors).toEqual(['Use from: instead of by:.']);
		expect(parseQuery('needs:review').errors[0]).toMatch(/Unknown “needs:”/);
		expect(parseQuery('is:bot').errors).toEqual(['Use author:bots instead of is:bot.']);
	});

	it('reports what it does not understand and leaves it out', () => {
		const q = parseQuery('foo:bar type:nope -repo:x is:weird repo: -from:alice ok');
		expect(q.when).toEqual({ text: 'ok' });
		expect(q.errors).toHaveLength(6);
		expect(q.errors[0]).toMatch(/Unknown “foo:”/);
		expect(q.errors[1]).toMatch(/pr, issue/);
	});

	it('round-trips', () => {
		for (const s of [
			'repo:acme/* author:dependabot* -author:bots from:bots label:"good first issue" type:pr,issue is:draft is:open fix login',
			'"a:b" word'
		]) {
			const when = parseQuery(s).when;
			expect(parseQuery(formatQuery(when)).when).toEqual(when);
		}
		expect(formatQuery({ type: ['Issue'], bot: true })).toBe('author:bots type:issue');
		expect(formatQuery({})).toBe('');
	});
});

describe('suggestions while you type', () => {
	const at = (q: string) => suggest(q, q.length);

	it('suggests words', () => {
		expect(at('ty').items.map((i) => i.label)).toEqual(['type:']);
		expect(at('-au').items.map((i) => i.insert)).toEqual(['author:']);
		expect(at('').items.length).toBeGreaterThan(5);
	});

	it('suggests values after the colon, also after a comma', () => {
		expect(at('type:').items.map((i) => i.label)).toEqual(['pr', 'issue']);
		const s = at('repo:x type:pr,is');
		expect(s.items.map((i) => i.label)).toEqual(['issue']);
		expect('repo:x type:pr,is'.slice(0, s.from)).toBe('repo:x type:pr,');
		expect(at('from:').items.map((i) => i.label)).toEqual(['bots']);
		expect(at('repo:').items).toEqual([]);
	});
});
