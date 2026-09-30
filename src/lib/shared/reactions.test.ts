import { describe, expect, it } from 'vitest';
import { reactionsOf, toggled } from './reactions';
import type { Reactions } from './types';

const r = (groups: Reactions['groups']): Reactions => ({ id: 'IC_1', canReact: true, groups });

describe('toggled', () => {
	it('adds your reaction to a group', () => {
		expect(toggled(r([{ content: 'HEART', count: 2, mine: false }]), 'HEART')).toEqual([
			{ content: 'HEART', count: 3, mine: true }
		]);
	});
	it('makes a new group in GitHub’s order', () => {
		expect(
			toggled(r([{ content: 'HEART', count: 1, mine: false }]), 'THUMBS_UP').map((g) => g.content)
		).toEqual(['THUMBS_UP', 'HEART']);
	});
	it('removes your reaction, and the group when it was the only one', () => {
		expect(toggled(r([{ content: 'EYES', count: 1, mine: true }]), 'EYES')).toEqual([]);
		expect(toggled(r([{ content: 'EYES', count: 3, mine: true }]), 'EYES')).toEqual([
			{ content: 'EYES', count: 2, mine: false }
		]);
	});
});

describe('reactionsOf', () => {
	it('keeps only groups with reactions, in order', () => {
		expect(
			reactionsOf({
				id: 'IC_1',
				viewerCanReact: true,
				reactionGroups: [
					{ content: 'ROCKET', viewerHasReacted: true, reactors: { totalCount: 1 } },
					{ content: 'LAUGH', viewerHasReacted: false, reactors: { totalCount: 0 } },
					{ content: 'THUMBS_UP', viewerHasReacted: false, reactors: { totalCount: 4 } }
				]
			})
		).toEqual(
			r([
				{ content: 'THUMBS_UP', count: 4, mine: false },
				{ content: 'ROCKET', count: 1, mine: true }
			])
		);
	});
	it('has no reactions without a node ID', () => {
		expect(reactionsOf({})).toBeUndefined();
	});
});
