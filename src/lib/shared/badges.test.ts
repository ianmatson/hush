import { describe, expect, it } from 'vitest';
import { newChanges, saidBy, whyAddsInfo } from './badges';
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

describe('whyAddsInfo', () => {
	it('hides a why tag the summary already says', () => {
		expect(whyAddsInfo('Review requested', '@alice requests your review')).toBe(false);
		expect(whyAddsInfo('You were mentioned', '@alice mentioned you')).toBe(false);
		expect(whyAddsInfo('You opened this', 'CI failed on your PR')).toBe(false);
		expect(whyAddsInfo('Assigned to you', 'An issue was assigned to you')).toBe(false);
	});
	it('keeps a why tag that says more', () => {
		expect(whyAddsInfo('Watching repo', 'New release')).toBe(true);
		expect(whyAddsInfo('You commented', '@bob replied')).toBe(true);
		expect(whyAddsInfo('Team mentioned', 'PR activity')).toBe(true);
	});
});
