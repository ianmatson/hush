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
	menus: DEFAULT_MENUS
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

/** The settings file: `hush` is the format version. */
export interface SettingsFile {
	hush: 1;
	exportedAt: string;
	settings: Settings;
}

export function settingsFile(settings: Settings, now = new Date()): SettingsFile {
	return { hush: 1, exportedAt: now.toISOString(), settings };
}

/**
 * The settings in an exported file, as a patch for the server (which checks each part). Only
 * known keys are kept. A string is an error message.
 */
export function settingsFromFile(text: string): Partial<Settings> | string {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		return 'This file is not JSON.';
	}
	const file = data as Partial<SettingsFile> | null;
	if (!file || typeof file !== 'object' || file.hush !== 1 || typeof file.settings !== 'object')
		return 'This is not a Hush settings file.';
	const raw = (file.settings ?? {}) as unknown as Record<string, unknown>;
	const patch = Object.fromEntries(
		Object.keys(DEFAULT_SETTINGS)
			.filter((k) => raw[k] !== undefined)
			.map((k) => [k, raw[k]])
	) as Partial<Settings>;
	return Object.keys(patch).length ? patch : 'The file has no settings.';
}
