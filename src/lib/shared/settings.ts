import { DEFAULT_DASH } from './dashboard';
import { DEFAULT_MENUS, upgradeMenus } from './menus';
import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
	pushAction: true,
	pushFyi: false,
	pushTurnChanges: true,
	pushResolved: true,
	quietHours: null,
	peekMarksRead: true,
	reviewResolution: 'strict',
	botsAreFyi: true,
	teamReviewsAreAction: false,
	rules: [],
	dash: DEFAULT_DASH,
	views: [],
	menus: DEFAULT_MENUS,
	keys: {}
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
			menus: raw.menus ? upgradeMenus(raw.menus) : DEFAULT_MENUS
		};
	} catch {
		return structuredClone(DEFAULT_SETTINGS);
	}
}
