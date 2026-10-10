import { DEFAULT_DASH } from './dashboard';
import { DEFAULT_VIEWS, validateViews } from './item-views';
import { DEFAULT_CATEGORY_GROUPS } from './categories';
import { DEFAULT_MENUS, upgradeMenus } from './menus';
import { DEFAULT_SWIPE, knownSwipe } from './swipe';
import { knownKeys } from './keymap';
import { DEFAULT_PUSH_FACTS, knownPushFacts } from './push-facts';
import { DEFAULT_ROWS, knownRowParts } from './row-parts';
import type { Settings } from './types';

const RETIRED_DASH_KEYS = ['pr', 'issue'];
const withoutRetiredDashKeys = (dash: object | undefined) =>
	Object.fromEntries(Object.entries(dash ?? {}).filter(([k]) => !RETIRED_DASH_KEYS.includes(k)));

export const DEFAULT_SETTINGS: Settings = {
	pushFacts: DEFAULT_PUSH_FACTS,
	quietHours: null,
	pushRepeat: 'once',
	pushDigestMinutes: null,
	pushLimit: null,
	pushWhileOpen: false,
	pushUrgentNow: false,
	alertChannels: { push: true, slack: true },
	smartDecisions: true,
	clearNotifications: 'open',
	dash: DEFAULT_DASH,
	categoryGroups: DEFAULT_CATEGORY_GROUPS,
	views: DEFAULT_VIEWS,
	menus: DEFAULT_MENUS,
	keys: {},
	swipe: DEFAULT_SWIPE,
	rows: DEFAULT_ROWS
};

/**
 * Merge stored settings over the defaults. New fields get their default value; fields that are
 * gone (such as an old digest time) are dropped.
 */
export function parseSettings(json: string | null | undefined): Settings {
	try {
		const stored = JSON.parse(json || '{}') as Record<string, unknown>;
		const raw = Object.fromEntries(
			Object.entries(stored).filter(([k]) => k in DEFAULT_SETTINGS)
		) as Partial<Settings>;
		return {
			...DEFAULT_SETTINGS,
			...raw,
			views: validateViews(raw.views, false) ? DEFAULT_VIEWS : raw.views!,
			dash: { ...DEFAULT_DASH, ...withoutRetiredDashKeys(raw.dash) },
			menus: raw.menus ? upgradeMenus(raw.menus) : DEFAULT_MENUS,
			swipe: knownSwipe(raw.swipe),
			keys: knownKeys(raw.keys),
			pushFacts: raw.pushFacts ? knownPushFacts(raw.pushFacts) : DEFAULT_PUSH_FACTS,
			rows: knownRowParts(raw.rows ?? {}),
			alertChannels: { ...DEFAULT_SETTINGS.alertChannels, ...(raw.alertChannels ?? {}) }
		};
	} catch {
		return structuredClone(DEFAULT_SETTINGS);
	}
}
