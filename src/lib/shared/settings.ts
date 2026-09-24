import { DEFAULT_DASH } from './dashboard';
import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
	pushAction: true,
	pushFyi: false,
	botsAreFyi: true,
	teamReviewsAreAction: false,
	rules: [],
	dash: DEFAULT_DASH
};

/** Merge stored settings over the defaults. New fields get their default value. */
export function parseSettings(json: string | null | undefined): Settings {
	try {
		const raw = JSON.parse(json || '{}') as Partial<Settings>;
		return { ...DEFAULT_SETTINGS, ...raw, dash: { ...DEFAULT_DASH, ...(raw.dash ?? {}) } };
	} catch {
		return structuredClone(DEFAULT_SETTINGS);
	}
}
