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

const counts: Counts = { alerts: 0, turn: 7, waiting: 3 };
const OLD = {
	enabled: true,
	sources: ['turn', 'waiting'] as CountSource[],
	style: 'total' as const
};

describe('title', () => {
	it('sums the chosen sources', () => {
		expect(total(counts, ['turn', 'waiting'])).toBe(10);
		expect(titlePrefix(counts, OLD)).toBe('(10)');
		expect(titlePrefix({ ...counts, turn: 4 }, DEFAULT_PREFS.title)).toBe('(4)');
	});
	it('breaks down by source and skips zeros', () => {
		const t = {
			enabled: true,
			sources: ['turn', 'waiting', 'alerts'] as CountSource[],
			style: 'breakdown' as const
		};
		expect(titlePrefix(counts, t)).toBe('(7 · 3 waiting)');
	});
	it('adds nothing when off or zero', () => {
		expect(titlePrefix(counts, { ...OLD, enabled: false })).toBe('');
		expect(titlePrefix({ ...counts, turn: 0, waiting: 0 }, OLD)).toBe('');
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

	it('defaults to Your turn everywhere', () => {
		const p = loadPrefs();
		expect(p.title.sources).toEqual(['turn']);
		expect(p.favicon).toMatchObject({ sources: ['turn'], style: 'count' });
		expect(p.appBadge.sources).toEqual(['turn']);
	});

	it('starts saved lists from before the lanes again, and keeps the rest of your choices', () => {
		store.set(
			'hush:tab-status',
			JSON.stringify({
				title: { enabled: true, sources: ['issueYou', 'inbox', 'prYou'], style: 'breakdown' },
				favicon: { enabled: false, sources: ['inbox'], color: 'blue' },
				v: 2
			})
		);
		const p = loadPrefs();
		expect(p.title).toEqual({ enabled: true, sources: ['turn'], style: 'breakdown' });
		expect(p.favicon).toEqual({ enabled: false, sources: ['turn'], color: 'blue', style: 'count' });
	});

	it('keeps lists saved at version 3', () => {
		store.set(
			'hush:tab-status',
			JSON.stringify({ title: { enabled: true, sources: ['waiting'], style: 'total' }, v: 3 })
		);
		expect(loadPrefs().title.sources).toEqual(['waiting']);
	});
});
