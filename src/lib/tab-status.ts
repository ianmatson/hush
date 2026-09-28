// Page title, favicon dot, and app badge from the notification counts. Preferences are per browser.

export type CountSource = 'alerts' | 'turn' | 'waiting';
export type Counts = Record<CountSource, number>;
export type DotColor = 'red' | 'blue' | 'amber' | 'green';

export interface TabStatusPrefs {
	title: { enabled: boolean; sources: CountSource[]; style: 'total' | 'breakdown' };
	/** `count` puts the number in the dot; `dot` is only a dot. */
	favicon: { enabled: boolean; sources: CountSource[]; color: DotColor; style: 'count' | 'dot' };
	appBadge: { enabled: boolean; sources: CountSource[] };
}

export const SOURCES: { id: CountSource; label: string; short: string }[] = [
	{ id: 'turn', label: 'Your turn', short: '' },
	{ id: 'waiting', label: 'Waiting', short: 'waiting' },
	{ id: 'alerts', label: 'Alerts: unread', short: 'new' }
];

// What is your turn: the one number that matters.
const DEFAULT_SOURCES: CountSource[] = ['turn'];
const PREFS_VERSION = 3;
const KNOWN = new Set<CountSource>(SOURCES.map((x) => x.id));

export const DEFAULT_PREFS: TabStatusPrefs = {
	title: { enabled: true, sources: DEFAULT_SOURCES, style: 'total' },
	favicon: { enabled: true, sources: DEFAULT_SOURCES, color: 'red', style: 'count' },
	appBadge: { enabled: true, sources: DEFAULT_SOURCES }
};

export const DOT_COLORS: Record<DotColor, string> = {
	red: '#ef4444',
	blue: '#4f7cff',
	amber: '#f59e0b',
	green: '#22c55e'
};

const KEY = 'hush:tab-status';

export function loadPrefs(): TabStatusPrefs {
	try {
		const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<TabStatusPrefs> & {
			v?: number;
		};
		const prefs: TabStatusPrefs = {
			title: { ...DEFAULT_PREFS.title, ...raw.title },
			favicon: { ...DEFAULT_PREFS.favicon, ...raw.favicon },
			appBadge: { ...DEFAULT_PREFS.appBadge, ...raw.appBadge }
		};
		// Version 3 has new counts (the lanes): older lists start again from the default.
		for (const g of [prefs.title, prefs.favicon, prefs.appBadge])
			if ((raw.v ?? 1) < PREFS_VERSION || g.sources.some((x) => !KNOWN.has(x)))
				g.sources = [...DEFAULT_SOURCES];
		return prefs;
	} catch {
		return structuredClone(DEFAULT_PREFS);
	}
}

export function savePrefs(p: TabStatusPrefs) {
	localStorage.setItem(KEY, JSON.stringify({ ...p, v: PREFS_VERSION }));
	// Let the live component in this tab pick up the change.
	window.dispatchEvent(new CustomEvent('hush:tab-status'));
}

export const total = (counts: Counts, sources: CountSource[]) =>
	sources.reduce((n, s) => n + (counts[s] ?? 0), 0);

/** "(7)" or "(7 · 3 PR · 2 issue)"; empty when nothing counts. Parts follow the SOURCES order. */
export function titlePrefix(counts: Counts, t: TabStatusPrefs['title']): string {
	if (!t.enabled || !total(counts, t.sources)) return '';
	if (t.style === 'total') return `(${total(counts, t.sources)})`;
	const parts = SOURCES.filter((s) => t.sources.includes(s.id) && counts[s.id] > 0).map((s) =>
		s.short ? `${counts[s.id]} ${s.short}` : String(counts[s.id])
	);
	return `(${parts.join(' · ')})`;
}

/** Replace a previous "(…)" prefix on a title. */
export function withPrefix(title: string, prefix: string): string {
	const base = title.replace(/^\([^)]*\)\s*/, '');
	return prefix ? `${prefix} ${base}` : base;
}

/** The Hush bell, with a status dot when `dot` is a color, and the number in it when `count`. */
export function faviconSvg(dot: string | null, count?: number): string {
	const bell = `<rect width="512" height="512" rx="112" fill="#0a0a0a"/><path d="M256 120c-62 0-104 46-104 106v58l-30 50c-6 10 1 22 13 22h242c12 0 19-12 13-22l-30-50v-58c0-60-42-106-104-106z" fill="none" stroke="#fafafa" stroke-width="30" stroke-linejoin="round"/><path d="M214 392c8 20 24 32 42 32s34-12 42-32" fill="none" stroke="#fafafa" stroke-width="30" stroke-linecap="round"/>`;
	// Big enough to read at 16 px, with a dark ring so it stands out on any tab color.
	// A number needs a bigger dot to read at 16 px.
	const label = count ? (count > 9 ? '9+' : String(count)) : '';
	const mark = !dot
		? ''
		: label
			? `<circle cx="340" cy="172" r="164" fill="${dot}" stroke="#0a0a0a" stroke-width="28"/><text x="340" y="172" dy="0.35em" text-anchor="middle" font-family="-apple-system,system-ui,Segoe UI,Roboto,sans-serif" font-weight="700" font-size="${label.length > 1 ? 196 : 250}" fill="#fff">${label}</text>`
			: `<circle cx="384" cy="128" r="104" fill="${dot}" stroke="#0a0a0a" stroke-width="32"/>`;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${bell}${mark}</svg>`;
}

export const faviconHref = (dot: string | null, count?: number) =>
	`data:image/svg+xml,${encodeURIComponent(faviconSvg(dot, count))}`;
