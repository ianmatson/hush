import { describe, expect, it } from 'vitest';
import { formatQuery, parseQuery, suggest } from './query';

describe('query language', () => {
	it('parses conditions and words', () => {
		expect(
			parseQuery('repo:acme/* needs:review -author:bots label:"good first issue" login bug')
		).toEqual({
			when: {
				repo: 'acme/*',
				kind: ['review'],
				bot: false,
				label: ['good first issue'],
				text: 'login bug'
			},
			errors: []
		});
	});

	it('reads the plain words for events, needs, and lists', () => {
		expect(parseQuery('event:you-opened,mentioned needs:nothing,changes in:fyi').when).toEqual({
			reason: ['author', 'mention'],
			kind: ['none', 'address_review'],
			category: ['fyi']
		});
		expect(parseQuery('NEEDS:Fix-CI').when).toEqual({ kind: ['fix_ci'] });
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
		expect(parseQuery('kind:review').errors).toEqual(['Use needs: instead of kind:.']);
		expect(parseQuery('reason:author').errors).toEqual(['Use event: instead of reason:.']);
		expect(parseQuery('category:bugs').errors).toEqual([]);
		expect(parseQuery('is:bot').errors).toEqual(['Use author:bots instead of is:bot.']);
	});

	it('reports what it does not understand and leaves it out', () => {
		const q = parseQuery('foo:bar needs:nope -repo:x is:weird repo: -from:alice ok');
		expect(q.when).toEqual({ text: 'ok' });
		expect(q.errors).toHaveLength(6);
		expect(q.errors[0]).toMatch(/Unknown “foo:”/);
		expect(q.errors[1]).toMatch(/review, fix-ci/);
	});

	it('round-trips', () => {
		for (const s of [
			'repo:acme/* author:dependabot* -author:bots from:bots label:"good first issue" type:pr,ci event:mentioned needs:nothing in:needs-you is:draft is:open fix login',
			'"a:b" word'
		]) {
			const when = parseQuery(s).when;
			expect(parseQuery(formatQuery(when)).when).toEqual(when);
		}
		expect(formatQuery({ kind: ['none'], reason: ['author'], bot: true })).toBe(
			'author:bots event:you-opened needs:nothing'
		);
		expect(formatQuery({})).toBe('');
	});
});

describe('suggestions while you type', () => {
	const at = (q: string) => suggest(q, q.length);

	it('suggests words', () => {
		expect(at('ne').items.map((i) => i.label)).toEqual(['needs:']);
		expect(at('-au').items.map((i) => i.insert)).toEqual(['author:']);
		expect(at('').items.length).toBeGreaterThan(5);
	});

	it('suggests values after the colon, also after a comma', () => {
		expect(at('needs:').items.map((i) => i.label)).toContain('nothing');
		expect(at('event:you-').items.map((i) => i.label)).toEqual(['you-opened', 'you-commented']);
		const s = at('repo:x needs:review,me');
		expect(s.items.map((i) => i.label)).toEqual(['merge']);
		expect('repo:x needs:review,me'.slice(0, s.from)).toBe('repo:x needs:review,');
		expect(at('from:').items.map((i) => i.label)).toEqual(['bots']);
		expect(at('repo:').items).toEqual([]);
	});
});
