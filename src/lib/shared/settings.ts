import { DEFAULT_DASH } from './dashboard';
import { DEFAULT_SOURCES, upgradeSources } from './sources';
import {
	categoriesWithLegacyRules,
	DEFAULT_CATEGORIES,
	DEFAULT_TAGS,
	upgradeDefaultCategories,
	upgradeDefaultTags
} from './categories';
import { DEFAULT_MENUS, upgradeMenus } from './menus';
import { DEFAULT_SWIPE } from './swipe';
import { DEFAULT_ROWS } from './row-parts';
import type { LegacyInboxRule, Settings } from './types';

const RETIRED_DASH_KEYS = ['pr', 'issue'];
const withoutRetiredDashKeys = (dash: object | undefined) =>
	Object.fromEntries(Object.entries(dash ?? {}).filter(([k]) => !RETIRED_DASH_KEYS.includes(k)));

export const DEFAULT_SETTINGS: Settings = {
	pushAction: true,
	pushFyi: false,
	pushTurnChanges: true,
	quietHours: null,
	pushRepeat: 'once',
	pushDigestMinutes: null,
	pushLimit: null,
	pushWhileOpen: false,
	pushUrgentNow: false,
	alertChannels: { push: true, slack: true },
	smartDecisions: true,
	clearNotifications: 'open',
	peekMarksRead: true,
	reviewResolution: 'strict',
	newCommitsAfterReview: 'always',
	botsAreFyi: true,
	teamReviewsAreAction: false,
	dash: DEFAULT_DASH,
	sources: DEFAULT_SOURCES,
	tracked: [],
	categories: DEFAULT_CATEGORIES,
	tags: DEFAULT_TAGS,
	views: [],
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
		const legacyRules = Array.isArray(stored.rules) ? (stored.rules as LegacyInboxRule[]) : [];
		return {
			...DEFAULT_SETTINGS,
			...raw,
			categories: categoriesWithLegacyRules(
				upgradeDefaultCategories(raw.categories ?? DEFAULT_CATEGORIES),
				legacyRules
			),
			tags: upgradeDefaultTags(raw.tags ?? DEFAULT_TAGS),
			sources: upgradeSources(raw.sources ?? DEFAULT_SOURCES),
			dash: { ...DEFAULT_DASH, ...withoutRetiredDashKeys(raw.dash) },
			menus: raw.menus ? upgradeMenus(raw.menus) : DEFAULT_MENUS,
			swipe: {
				inbox: { ...DEFAULT_SWIPE.inbox, ...(raw.swipe?.inbox ?? {}) },
				dash: { ...DEFAULT_SWIPE.dash, ...(raw.swipe?.dash ?? {}) }
			},
			rows: { ...DEFAULT_ROWS, ...(raw.rows ?? {}) },
			alertChannels: { ...DEFAULT_SETTINGS.alertChannels, ...(raw.alertChannels ?? {}) }
		};
	} catch {
		return structuredClone(DEFAULT_SETTINGS);
	}
}
