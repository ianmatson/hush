import { describe, expect, it } from 'vitest';
import { reactionsOf, reactorsText, toggled } from './reactions';
import type { Reactions } from './types';

const r = (groups: Reactions['groups']): Reactions => ({ id: 'IC_1', canReact: true, groups });

describe('toggled', () => {
	it('adds your reaction to a group', () => {
		expect(
			toggled(r([{ content: 'HEART', count: 2, mine: false, names: ['a', 'b'] }]), 'HEART')
		).toEqual([{ content: 'HEART', count: 3, mine: true, names: ['a', 'b'] }]);
	});
	it('makes a new group in GitHub’s order', () => {
		expect(
			toggled(r([{ content: 'HEART', count: 1, mine: false, names: ['a'] }]), 'THUMBS_UP').map(
				(g) => g.content
			)
		).toEqual(['THUMBS_UP', 'HEART']);
	});
	it('removes your reaction, and the group when it was the only one', () => {
		expect(toggled(r([{ content: 'EYES', count: 1, mine: true, names: ['me'] }]), 'EYES')).toEqual(
			[]
		);
		expect(
			toggled(r([{ content: 'EYES', count: 3, mine: true, names: ['me', 'a', 'b'] }]), 'EYES')
		).toEqual([{ content: 'EYES', count: 2, mine: false, names: ['me', 'a', 'b'] }]);
	});
});

describe('reactionsOf', () => {
	it('keeps only groups with reactions, in order, with who gave them', () => {
		expect(
			reactionsOf({
				id: 'IC_1',
				viewerCanReact: true,
				reactionGroups: [
					{
						content: 'ROCKET',
						viewerHasReacted: true,
						reactors: { totalCount: 1, nodes: [{ login: 'me' }] }
					},
					{ content: 'LAUGH', viewerHasReacted: false, reactors: { totalCount: 0, nodes: [] } },
					{
						content: 'THUMBS_UP',
						viewerHasReacted: false,
						reactors: { totalCount: 4, nodes: [{ login: 'a' }, {}, null, { login: 'b' }] }
					}
				]
			})
		).toEqual(
			r([
				{ content: 'THUMBS_UP', count: 4, mine: false, names: ['a', 'b'] },
				{ content: 'ROCKET', count: 1, mine: true, names: ['me'] }
			])
		);
	});
	it('has no reactions without a node ID', () => {
		expect(reactionsOf({})).toBeUndefined();
	});
});

describe('reactorsText', () => {
	const g = (count: number, mine: boolean, names: string[]): Reactions['groups'][number] => ({
		content: 'HEART',
		count,
		mine,
		names
	});
	it('names everyone, you first', () => {
		expect(reactorsText(g(1, false, ['alice']), 'me')).toBe('alice');
		expect(reactorsText(g(1, true, ['me']), 'me')).toBe('You');
		expect(reactorsText(g(2, true, ['alice', 'me']), 'me')).toBe('You and alice');
		expect(reactorsText(g(3, false, ['alice', 'bob', 'carol']), 'me')).toBe(
			'alice, bob, and carol'
		);
	});
	it('counts the people it has no names for', () => {
		expect(reactorsText(g(12, true, ['alice', 'bob']), 'me')).toBe('You, alice, bob, and 9 more');
		expect(reactorsText(g(3, false, []), 'me')).toBe('3');
	});
	it('follows your reaction before the peek loads again', () => {
		expect(reactorsText(g(2, true, ['alice']), 'me')).toBe('You and alice');
		expect(reactorsText(g(1, false, ['me', 'alice']), 'me')).toBe('alice');
	});
});
