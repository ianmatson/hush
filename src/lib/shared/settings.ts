import { DEFAULT_DASH } from './dashboard';
import { DEFAULT_MENUS, upgradeMenus } from './menus';
import { DEFAULT_SWIPE } from './swipe';
import type { Settings } from './types';

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
	smartDecisions: false,
	clearNotifications: 'open',
	peekMarksRead: true,
	reviewResolution: 'strict',
	botsAreFyi: true,
	teamReviewsAreAction: false,
	rules: [],
	dash: DEFAULT_DASH,
	views: [],
	menus: DEFAULT_MENUS,
	keys: {},
	swipe: DEFAULT_SWIPE
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
			dash: { ...DEFAULT_DASH, ...(raw.dash ?? {}) },
			menus: raw.menus ? upgradeMenus(raw.menus) : DEFAULT_MENUS,
			swipe: {
				inbox: { ...DEFAULT_SWIPE.inbox, ...(raw.swipe?.inbox ?? {}) },
				dash: { ...DEFAULT_SWIPE.dash, ...(raw.swipe?.dash ?? {}) }
			}
		};
	} catch {
		return structuredClone(DEFAULT_SETTINGS);
	}
}
