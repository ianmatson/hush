import { validateRules } from './place';
import { validateMenu } from './menus';
import { validateKeys } from './keymap';
import { validateQuietHours } from './quiet';
import { validateSaved } from './search';
import { DEFAULT_SETTINGS } from './settings';
import type { Settings } from './types';

/**
 * Every setting, for the settings.json editor and the docs: one entry per key. `page` is where
 * the app shows it; null means settings.json only.
 */
export type SettingsPage = 'turn' | 'notifications' | 'advanced' | 'keys';
export interface SettingInfo {
	key: keyof Settings;
	page: SettingsPage | null;
	description: string;
}

export const SETTINGS_DOCS: SettingInfo[] = [
	{
		key: 'teamReviewsAreMine',
		page: 'turn',
		description:
			'A review request to one of your teams is your turn. Off: it waits on the team (in Waiting).'
	},
	{
		key: 'reviewResolution',
		page: 'turn',
		description:
			'When a review request stops being your turn. "strict": when GitHub no longer asks you. "any_review": also when someone else approves or asks for changes.'
	},
	{
		key: 'botsAreUpdates',
		page: 'turn',
		description:
			'PRs that bots open, and comments by bots, are updates. A review request to you by name still counts.'
	},
	{
		key: 'staleDays',
		page: 'turn',
		description: 'An item that has waited more than this many days is stale (1 to 60).'
	},
	{
		key: 'rules',
		page: 'advanced',
		description:
			'Rules, top to bottom; the first match wins. Each is { "name", "enabled", "when": a query, "then": { "lane", "push", "mute", "snoozeHours" } }.'
	},
	{
		key: 'push',
		page: 'notifications',
		description: 'Push when something becomes your turn.'
	},
	{
		key: 'pushResolved',
		page: 'notifications',
		description:
			'Change an alert from the last day to a quiet “✓ You approved” (or “Done”, “CI passes now”…) when it is resolved, then close it.'
	},
	{
		key: 'quietHours',
		page: 'notifications',
		description:
			'No pushes at these times: { "from": minutes after midnight, "to": minutes, "weekends": true or false, "timeZone": "Europe/London" }, or null for off.'
	},
	{
		key: 'markReadOnGitHub',
		page: 'turn',
		description:
			'When you see an item in Hush, mark its notification read on GitHub; when you choose Done, mark it done there.'
	},
	{
		key: 'searches',
		page: 'advanced',
		description:
			'GitHub searches that find items with no notification: { "id", "name", "query", "enabled" }. @me is you; @team runs once per team.'
	},
	{
		key: 'searchScope',
		page: 'advanced',
		description: 'Added to every tracked search, for example "org:acme archived:false".'
	},
	{
		key: 'excludedTeams',
		page: 'advanced',
		description: '"org/team" slugs that @team skips.'
	},
	{
		key: 'saved',
		page: null,
		description: 'Saved searches: tabs after the lanes. Each is { "id", "name", "query" }.'
	},
	{
		key: 'keys',
		page: 'keys',
		description:
			'Keyboard shortcuts you changed: { "command id": ["key", …] }, for example { "item.done": ["d"] }. [] turns a shortcut off. Keys: "j", "Shift+j", "Mod+k" (⌘ or Ctrl), "Enter", "Space", "?".'
	},
	{
		key: 'menu',
		page: 'advanced',
		description: 'The right-click and “⋯” menu of an item: item ids in order; "sep" is a line.'
	}
];

/** Settings that change where items go: a change places every stored item again. */
export const REPLACE_KEYS: (keyof Settings)[] = [
	'rules',
	'botsAreUpdates',
	'reviewResolution',
	'teamReviewsAreMine',
	'staleDays'
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Only what differs from the defaults: what Hush stores, what settings.json shows, and what a
 * settings file has. A new default then applies to everyone who did not change that setting.
 */
export function settingsOverrides(s: Settings): Partial<Settings> {
	return Object.fromEntries(
		(Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[])
			.filter((k) => !same(s[k], DEFAULT_SETTINGS[k]))
			.map((k) => [k, s[k]])
	) as Partial<Settings>;
}

/** Put a patch on settings. */
export function mergeSettings(base: Settings, patch: Partial<Settings>): Settings {
	return { ...base, ...patch };
}

const bool = (k: string) => (v: unknown) =>
	typeof v === 'boolean' ? null : `"${k}" must be true or false.`;

const ID = /^[a-z0-9-]{1,40}$/;
function validateSearches(v: unknown): string | null {
	if (!Array.isArray(v) || v.length > 20) return '"searches" must be a list of up to 20 searches.';
	const ids = new Set<string>();
	for (const s of v) {
		if (typeof s?.id !== 'string' || !ID.test(s.id))
			return 'Each tracked search needs an id: 1 to 40 lower-case letters, digits, or dashes.';
		if (ids.has(s.id)) return `Two tracked searches use the id "${s.id}".`;
		ids.add(s.id);
		if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 60)
			return 'Each tracked search needs a name (60 characters or fewer).';
		if (typeof s.query !== 'string' || !s.query.trim() || s.query.length > 256)
			return `"${s.name}": the query must have 1–256 characters.`;
		if (typeof s.enabled !== 'boolean') return `"${s.name}": "enabled" must be true or false.`;
	}
	return null;
}

const CHECKS: Record<keyof Settings, (v: unknown) => string | null> = {
	teamReviewsAreMine: bool('teamReviewsAreMine'),
	reviewResolution: (v) =>
		v === 'strict' || v === 'any_review'
			? null
			: '"reviewResolution" must be "strict" or "any_review".',
	botsAreUpdates: bool('botsAreUpdates'),
	staleDays: (v) =>
		Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 60
			? null
			: '"staleDays" must be a whole number from 1 to 60.',
	rules: validateRules,
	push: bool('push'),
	pushResolved: bool('pushResolved'),
	quietHours: validateQuietHours,
	markReadOnGitHub: bool('markReadOnGitHub'),
	searches: validateSearches,
	searchScope: (v) =>
		typeof v === 'string' && v.length <= 200
			? null
			: '"searchScope" must be text of 200 characters or fewer.',
	excludedTeams: (v) =>
		Array.isArray(v) && v.every((t) => typeof t === 'string')
			? null
			: '"excludedTeams" must be a list of "org/team" slugs.',
	saved: validateSaved,
	keys: validateKeys,
	menu: validateMenu
};

/** Check the keys of a patch. Returns an error message, or null. */
export function validateSettings(next: Settings, keys: string[]): string | null {
	for (const k of keys) {
		const check = CHECKS[k as keyof Settings];
		if (!check) return `Unknown setting "${k}".`;
		const err = check(next[k as keyof Settings]);
		if (err) return err;
	}
	return null;
}

/** The settings file: `hush` is the format version; `settings` has only your changes. */
export interface SettingsFile {
	hush: 2;
	exportedAt: string;
	settings: Partial<Settings>;
}

export function settingsFile(settings: Settings, now = new Date()): SettingsFile {
	return { hush: 2, exportedAt: now.toISOString(), settings: settingsOverrides(settings) };
}

/**
 * The settings in an exported file, for the server to check and save in place of yours. Keys
 * Hush no longer has are dropped. A string is an error message.
 */
export function settingsFromFile(text: string): Partial<Settings> | string {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		return 'This file is not JSON.';
	}
	const file = data as Partial<SettingsFile> | null;
	if (!file || typeof file !== 'object' || typeof file.settings !== 'object')
		return 'This is not a Hush settings file.';
	if (file.hush !== 2)
		return 'This settings file is from an older Hush. Its settings do not fit this version.';
	const raw = (file.settings ?? {}) as unknown as Record<string, unknown>;
	const patch = Object.fromEntries(
		Object.keys(DEFAULT_SETTINGS)
			.filter((k) => raw[k] !== undefined)
			.map((k) => [k, raw[k]])
	) as Partial<Settings>;
	return Object.keys(patch).length ? patch : 'The file has no settings.';
}
