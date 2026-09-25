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

const counts: Counts = { alerts: 0, inbox: 7, inboxFyi: 2, prYou: 3, prTeam: 8, issueYou: 0 };
const OLD = {
	enabled: true,
	sources: ['inbox', 'prYou', 'issueYou'] as CountSource[],
	style: 'total' as const
};

describe('title', () => {
	it('sums the chosen sources', () => {
		expect(total(counts, ['inbox', 'prYou', 'issueYou'])).toBe(10);
		expect(titlePrefix(counts, OLD)).toBe('(10)');
		expect(titlePrefix({ ...counts, alerts: 4 }, DEFAULT_PREFS.title)).toBe('(4)');
	});
	it('breaks down by source and skips zeros', () => {
		const t = {
			enabled: true,
			sources: ['inbox', 'prYou', 'issueYou', 'prTeam'] as CountSource[],
			style: 'breakdown' as const
		};
		expect(titlePrefix(counts, t)).toBe('(7 · 3 PR · 8 team)');
	});
	it('adds nothing when off or zero', () => {
		expect(titlePrefix(counts, { ...OLD, enabled: false })).toBe('');
		expect(titlePrefix({ ...counts, inbox: 0, prYou: 0 }, OLD)).toBe('');
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

	it('moves saved old defaults to the new default, and keeps lists you changed', () => {
		store.set(
			'hush:tab-status',
			JSON.stringify({
				title: { enabled: true, sources: ['issueYou', 'inbox', 'prYou'], style: 'breakdown' },
				favicon: { enabled: false, sources: ['inbox'], color: 'blue' },
				appBadge: { enabled: true, sources: ['inbox', 'prYou', 'issueYou'] }
			})
		);
		const p = loadPrefs();
		expect(p.title).toEqual({ enabled: true, sources: ['alerts'], style: 'breakdown' });
		expect(p.favicon).toEqual({
			enabled: false,
			sources: ['inbox'],
			color: 'blue',
			style: 'count'
		});
		expect(p.appBadge.sources).toEqual(['alerts']);
	});

	it('does not migrate again after a save at version 2', () => {
		store.set(
			'hush:tab-status',
			JSON.stringify({
				...DEFAULT_PREFS,
				title: { ...DEFAULT_PREFS.title, sources: ['inbox', 'prYou', 'issueYou'] },
				v: 2
			})
		);
		expect(loadPrefs().title.sources).toEqual(['inbox', 'prYou', 'issueYou']);
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
		const counts = { alerts: 2, inbox: 5, inboxFyi: 0, prYou: 1, prTeam: 0, issueYou: 0 };
		expect(
			titlePrefix(counts, {
				enabled: true,
				sources: ['alerts', 'inbox', 'prYou'],
				style: 'breakdown'
			})
		).toBe('(2 new · 5 · 1 PR)');
	});
});
