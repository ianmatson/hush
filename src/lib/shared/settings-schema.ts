import { validateRules } from './classify';
import { validateDash } from './dashboard';
import { MENUS_VERSION, validateMenus } from './menus';
import { validateKeys } from './keymap';
import { formatQuery } from './query';
import { validateQuietHours } from './quiet';
import { DEFAULT_SETTINGS } from './settings';
import type { RuleMatch, Settings } from './types';
import { validateViews } from './views';

/**
 * Every setting, for the settings.json editor and the docs: one entry per key (and per key of
 * the `dash` and `menus` groups). `page` is where the UI shows it; null means JSON only.
 */
export type SettingsPage = 'inbox' | 'dashboards' | 'notifications' | 'general' | 'keys';
export interface SettingInfo {
	key: string;
	page: SettingsPage | null;
	description: string;
}

export const SETTINGS_DOCS: SettingInfo[] = [
	{
		key: 'pushAction',
		page: 'notifications',
		description: 'Push “Needs you” threads: review requests, failed CI on your PRs, replies.'
	},
	{
		key: 'pushFyi',
		page: 'notifications',
		description: 'Push FYI threads too. Usually noisy; a rule with "push" is often better.'
	},
	{
		key: 'pushTurnChanges',
		page: null,
		description:
			'Push when a thread becomes your turn with no new notification from GitHub, for example new commits after your review.'
	},
	{
		key: 'pushResolved',
		page: null,
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
		key: 'peekMarksRead',
		page: null,
		description: 'A thread open in the peek for a moment is marked as read (also on GitHub).'
	},
	{
		key: 'reviewResolution',
		page: null,
		description:
			'When a review request stops being your turn. "strict": when GitHub no longer asks you. "any_review": also when someone else approves or asks for changes.'
	},
	{
		key: 'botsAreFyi',
		page: 'inbox',
		description: 'Activity by bots (dependabot, renovate, codecov…) is FYI.'
	},
	{
		key: 'teamReviewsAreAction',
		page: 'inbox',
		description: 'A review request to one of your teams is “Needs you”, not FYI.'
	},
	{
		key: 'rules',
		page: 'inbox',
		description:
			'Inbox rules, top to bottom; the first match wins. Each is { "name", "enabled", "when": conditions, "then": { "category", "push", "triage", "snoozeHours" } }.'
	},
	{
		key: 'views',
		page: 'inbox',
		description:
			'Saved views: extra inbox tabs. Each is { "id", "name", "base", "when": conditions }.'
	},
	{
		key: 'dash.pr',
		page: 'dashboards',
		description:
			'Pull request sections: saved GitHub searches { "id", "name", "query", "enabled" }. @me is you; @team runs once per tracked team.'
	},
	{ key: 'dash.issue', page: 'dashboards', description: 'Issue sections, the same as dash.pr.' },
	{
		key: 'dash.scope',
		page: 'dashboards',
		description: 'Added to every search, for example "org:acme archived:false".'
	},
	{
		key: 'dash.excludedTeams',
		page: 'dashboards',
		description: '"org/team" slugs that @team skips.'
	},
	{
		key: 'dash.staleDays',
		page: null,
		description: 'An item whose turn is older than this many days is marked stale (1 to 60).'
	},
	{
		key: 'dash.hideOthersDrafts',
		page: null,
		description: 'Hide draft PRs that you did not open.'
	},
	{
		key: 'dash.hideBots',
		page: null,
		description: 'Hide PRs and issues that bots opened, unless your review is requested.'
	},
	{
		key: 'menus.inbox',
		page: 'general',
		description:
			'The right-click and “⋯” menu of inbox threads: item ids in order; "sep" is a line.'
	},
	{ key: 'menus.dash', page: 'general', description: 'The menu of PRs and issues, the same way.' },
	{
		key: 'keys',
		page: 'keys',
		description:
			'Keyboard shortcuts you changed: { "command id": ["key", …] }, for example { "inbox.done": ["d"] }. [] turns a shortcut off. Keys: "j", "Shift+j", "Mod+k" (⌘ or Ctrl), "Enter", "Space", "?".'
	}
];

/** Settings that are objects of their own settings (a change to one key keeps the others). */
const GROUPS = new Set<keyof Settings>(['dash', 'menus']);
/** Settings that change how threads are sorted: a change re-sorts the stored threads. */
export const RECLASSIFY_KEYS: (keyof Settings)[] = [
	'rules',
	'botsAreFyi',
	'reviewResolution',
	'teamReviewsAreAction'
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Only what differs from the defaults: what Hush stores, what settings.json shows, and what a
 * settings file has. A new default then applies to everyone who did not change that setting.
 */
export function settingsOverrides(s: Settings): Partial<Settings> {
	const out: Record<string, unknown> = {};
	for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
		const v = s[k];
		const d = DEFAULT_SETTINGS[k];
		if (GROUPS.has(k)) {
			const group = Object.fromEntries(
				Object.entries(v as object).filter(
					([sub, x]) => sub !== 'v' && !same(x, (d as Record<string, unknown>)[sub])
				)
			);
			if (Object.keys(group).length)
				out[k] = k === 'menus' ? { ...group, v: MENUS_VERSION } : group;
		} else if (!same(v, d)) out[k] = v;
	}
	return out as Partial<Settings>;
}

/** Put a patch on settings: groups keep the keys the patch does not have. */
export function mergeSettings(base: Settings, patch: Partial<Settings>): Settings {
	const next = { ...base } as Record<string, unknown>;
	for (const [k, v] of Object.entries(patch))
		next[k] = GROUPS.has(k as keyof Settings)
			? { ...(base[k as keyof Settings] as object), ...(v as object) }
			: v;
	return next as unknown as Settings;
}

const bool = (k: string) => (v: unknown) =>
	typeof v === 'boolean' ? null : `"${k}" must be true or false.`;
const CHECKS: Record<keyof Settings, (v: unknown) => string | null> = {
	pushAction: bool('pushAction'),
	pushFyi: bool('pushFyi'),
	pushTurnChanges: bool('pushTurnChanges'),
	pushResolved: bool('pushResolved'),
	peekMarksRead: bool('peekMarksRead'),
	botsAreFyi: bool('botsAreFyi'),
	teamReviewsAreAction: bool('teamReviewsAreAction'),
	quietHours: validateQuietHours,
	reviewResolution: (v) =>
		v === 'strict' || v === 'any_review'
			? null
			: '"reviewResolution" must be "strict" or "any_review".',
	rules: validateRules,
	views: validateViews,
	dash: validateDash,
	menus: validateMenus,
	keys: validateKeys
};

/**
 * Check the keys of a patch (after mergeSettings, so a group is checked whole). Returns an
 * error message, or null.
 */
export function validateSettings(next: Settings, keys: string[]): string | null {
	for (const k of keys) {
		const check = CHECKS[k as keyof Settings];
		if (!check) return `Unknown setting "${k}".`;
		const err = check(next[k as keyof Settings]);
		if (err) return err;
		if (GROUPS.has(k as keyof Settings))
			for (const sub of Object.keys(next[k as keyof Settings] as object))
				if (sub !== 'v' && !SETTINGS_DOCS.some((d) => d.key === `${k}.${sub}`))
					return `Unknown setting "${k}.${sub}".`;
	}
	return null;
}

/**
 * The settings file: `hush` is the format version; `settings` has only your changes. Version 2
 * stores the conditions of rules and views as query text; version 1 had JSON conditions.
 */
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
	const file = data as { hush?: unknown; settings?: unknown } | null;
	if (!file || typeof file !== 'object' || typeof file.settings !== 'object')
		return 'This is not a Hush settings file.';
	if (file.hush !== 1 && file.hush !== 2) return 'This settings file is from a newer Hush.';
	const raw = (file.hush === 1 ? fromVersion1(file.settings) : (file.settings ?? {})) as Record<
		string,
		unknown
	>;
	const patch = Object.fromEntries(
		Object.keys(DEFAULT_SETTINGS)
			.filter((k) => raw[k] !== undefined)
			.map((k) => [k, raw[k]])
	) as Partial<Settings>;
	return Object.keys(patch).length ? patch : 'The file has no settings.';
}

/** A version 1 file: the JSON conditions of rules and views as query text. */
function fromVersion1(settings: unknown): Record<string, unknown> {
	const s = { ...(settings as Record<string, unknown>) };
	const asQuery = (when: unknown) =>
		when && typeof when === 'object' ? formatQuery(when as RuleMatch) : when;
	if (Array.isArray(s.rules))
		s.rules = s.rules.map((r) =>
			r && typeof r === 'object' ? { ...r, when: asQuery(r.when) } : r
		);
	if (Array.isArray(s.views))
		s.views = s.views.map((v) => {
			if (!v || typeof v !== 'object' || !('when' in v)) return v;
			const { when, ...rest } = v as { when: unknown };
			return { ...rest, query: asQuery(when) };
		});
	return s;
}
