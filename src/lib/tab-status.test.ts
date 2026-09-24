import { describe, expect, it } from 'vitest';
import {
	DEFAULT_PREFS,
	faviconSvg,
	titlePrefix,
	total,
	withPrefix,
	type Counts
} from './tab-status';

const counts: Counts = { inbox: 7, inboxFyi: 2, prYou: 3, prTeam: 8, issueYou: 0 };

describe('title', () => {
	it('sums the chosen sources', () => {
		expect(total(counts, ['inbox', 'prYou', 'issueYou'])).toBe(10);
		expect(titlePrefix(counts, DEFAULT_PREFS.title)).toBe('(10)');
	});
	it('breaks down by source and skips zeros', () => {
		const t = {
			enabled: true,
			sources: ['inbox', 'prYou', 'issueYou', 'prTeam'] as const,
			style: 'breakdown' as const
		};
		expect(titlePrefix(counts, { ...t, sources: [...t.sources] })).toBe('(7 · 3 PR · 8 team)');
	});
	it('adds nothing when off or zero', () => {
		expect(titlePrefix(counts, { ...DEFAULT_PREFS.title, enabled: false })).toBe('');
		expect(titlePrefix({ ...counts, inbox: 0, prYou: 0 }, DEFAULT_PREFS.title)).toBe('');
	});
	it('replaces an old prefix instead of stacking', () => {
		expect(withPrefix('(3) Pull requests · Hush', '(5)')).toBe('(5) Pull requests · Hush');
		expect(withPrefix('(3) Hush', '')).toBe('Hush');
		expect(withPrefix('Hush', '(1)')).toBe('(1) Hush');
	});
});

describe('favicon', () => {
	it('draws a dot only when asked', () => {
		expect(faviconSvg(null)).not.toContain('<circle');
		expect(faviconSvg('#ef4444')).toContain('fill="#ef4444"');
	});
});
