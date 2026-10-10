import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_PREFS,
	faviconSvg,
	loadPrefs,
	titlePrefix,
	total,
	withPrefix,
	type CountSource,
	type Counts
} from './tab-status';

const counts: Counts = { alerts: 0, unread: 7, prYou: 3, prTeam: 8, issueYou: 0 };
const OLD = {
	enabled: true,
	sources: ['unread', 'prYou', 'issueYou'] as CountSource[],
	style: 'total' as const
};

describe('title', () => {
	it('sums the chosen sources', () => {
		expect(total(counts, ['unread', 'prYou', 'issueYou'])).toBe(10);
		expect(titlePrefix(counts, OLD)).toBe('(10)');
		expect(titlePrefix({ ...counts, alerts: 4 }, DEFAULT_PREFS.title)).toBe('(4)');
	});
	it('breaks down by source and skips zeros', () => {
		const t = {
			enabled: true,
			sources: ['unread', 'prYou', 'issueYou', 'prTeam'] as CountSource[],
			style: 'breakdown' as const
		};
		expect(titlePrefix(counts, t)).toBe('(7 unread · 3 PR · 8 team)');
	});
	it('adds nothing when off or zero', () => {
		expect(titlePrefix(counts, { ...OLD, enabled: false })).toBe('');
		expect(titlePrefix({ ...counts, unread: 0, prYou: 0 }, OLD)).toBe('');
		expect(titlePrefix(counts, DEFAULT_PREFS.title)).toBe('');
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

describe('tab status prefs', () => {
	const store = new Map<string, string>();
	vi.stubGlobal('localStorage', {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => store.set(k, v)
	});
	afterEach(() => store.clear());

	it('defaults to unread alerts everywhere', () => {
		const p = loadPrefs();
		expect(p.title.sources).toEqual(['alerts']);
		expect(p.favicon).toMatchObject({ sources: ['alerts'], style: 'count' });
		expect(p.appBadge.sources).toEqual(['alerts']);
	});

	it('drops the inbox counts from saved lists', () => {
		store.set(
			'hush:tab-status',
			JSON.stringify({
				title: { enabled: true, sources: ['issueYou', 'inbox', 'prYou'], style: 'breakdown' },
				favicon: { enabled: false, sources: ['inboxFyi'], color: 'blue' },
				appBadge: { enabled: true, sources: ['alerts', 'inbox'] },
				v: 2
			})
		);
		const p = loadPrefs();
		expect(p.title).toEqual({
			enabled: true,
			sources: ['issueYou', 'prYou'],
			style: 'breakdown'
		});
		expect(p.favicon.sources).toEqual([]);
		expect(p.appBadge.sources).toEqual(['alerts']);
	});
});

describe('tab icon', () => {
	it('puts the number in the dot, up to 9+', () => {
		expect(faviconSvg('#f00', 3)).toContain('>3</text>');
		expect(faviconSvg('#f00', 12)).toContain('>9+</text>');
		expect(faviconSvg('#f00')).not.toContain('<text');
		expect(faviconSvg(null, 3)).not.toContain('<circle');
	});

	it('labels unread alerts as "new" in the breakdown title', () => {
		const counts = { alerts: 2, unread: 5, prYou: 1, prTeam: 0, issueYou: 0 };
		expect(
			titlePrefix(counts, {
				enabled: true,
				sources: ['alerts', 'unread', 'prYou'],
				style: 'breakdown'
			})
		).toBe('(2 new · 5 unread · 1 PR)');
	});
});
