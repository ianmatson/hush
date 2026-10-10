import { describe, expect, it } from 'vitest';
import { newChanges, saidBy } from './badges';
import type { Change } from './types';

const c = (kind: Change['kind'], text: string): Change => ({ kind, text, tone: null });

describe('saidBy', () => {
	it('reads the facts a reason says', () => {
		expect([...saidBy('Draft')]).toEqual(['draft']);
		expect([...saidBy('CI failing')]).toEqual(['ci']);
		expect([...saidBy('Changes requested')]).toEqual(['review']);
		expect([...saidBy('Ready to merge')]).toEqual(['review']);
		expect([...saidBy('Merge conflict')]).toEqual(['conflicts']);
		expect([...saidBy('2 open threads')]).toEqual(['threads']);
		expect([...saidBy('Re-review requested')]).toEqual(['requested']);
		expect([...saidBy('@bob requests your review')]).toEqual(['requested']);
	});
	it('reads nothing into other reasons', () => {
		expect(saidBy('You approved').size).toBe(0);
		expect(saidBy('Waiting for review').size).toBe(0);
		expect(saidBy('Review for acme/web').size).toBe(0);
	});
});

describe('newChanges', () => {
	it('leaves out a change that the row already says', () => {
		const all = [
			c('ci', 'CI running'),
			c('requested', 'Your review is requested'),
			c('commits', '+2 commits')
		];
		expect(newChanges(all, saidBy('Review requested'), ['Review requested'])).toEqual([
			all[0],
			all[2]
		]);
		expect(newChanges(all, saidBy('CI running'), ['CI running']).map((x) => x.text)).toEqual([
			'Your review is requested',
			'+2 commits'
		]);
	});
	it('leaves out a change with the same text', () => {
		expect(newChanges([c('state', 'Merged')], new Set(), ['merged'])).toEqual([]);
	});
});
