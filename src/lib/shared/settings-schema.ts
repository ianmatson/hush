import { validateDash } from './dashboard';
import { validateSources, validateTracked } from './sources';
import {
	categoriesWithLegacyRules,
	DEFAULT_CATEGORIES,
	markQueries,
	validateCategories,
	validateTags
} from './categories';
import { MAX_SMART_CONDITIONS, smartConditions } from './decisions';
import { MENUS_VERSION, validateMenus } from './menus';
import { validateSwipe } from './swipe';
import { validateRows } from './row-parts';
import { validateKeys } from './keymap';
import { formatQuery } from './query';
import { validateQuietHours } from './quiet';
import {
	DIGEST_MINUTES,
	validateClearNotifications,
	validateDigestMinutes,
	validatePushLimit,
	validatePushRepeat
} from './push-policy';
import { DEFAULT_SETTINGS } from './settings';
import type { ItemCategory, LegacyInboxRule, RuleMatch, Settings } from './types';
import { validateViews } from './views';

/**
 * Every setting, for the settings.json editor and the docs: one entry per key (and per key of
 * the `dash` and `menus` groups). `page` is where the UI shows it; null means JSON only.
 */
export type SettingsPage =
	'inbox' | 'dashboards' | 'categories' | 'notifications' | 'general' | 'keys';
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
		key: 'quietHours',
		page: 'notifications',
		description:
			'No pushes at these times: { "from": minutes after midnight, "to": minutes, "weekends": true or false, "timeZone": "Europe/London" }, or null for off.'
	},
	{
		key: 'pushRepeat',
		page: 'notifications',
		description:
			'When one PR or issue can push again. "once": not until you open Hush (or read it on GitHub). "reason": also when the reason changes, such as review requested → changes requested. "every": each update.'
	},
	{
		key: 'pushDigestMinutes',
		page: 'notifications',
		description: `Send pushes together, as one digest every this many minutes (${DIGEST_MINUTES.min} to ${DIGEST_MINUTES.max}), or null to send each one at once.`
	},
	{
		key: 'pushLimit',
		page: 'notifications',
		description:
			'After { "count" } pushes in { "minutes" }, the rest wait and go as one digest when the time is over. null: no limit.'
	},
	{
		key: 'pushWhileOpen',
		page: 'notifications',
		description:
			'Push also while Hush is open and in use on a device. Off: what happens then shows only in Hush.'
	},
	{
		key: 'pushUrgentNow',
		page: 'notifications',
		description:
			'With smart decisions on: push a “Needs you” item at once, also during a digest or over the push limit, when its text says it blocks something or is an incident. Quiet hours still hold it.'
	},
	{
		key: 'clearNotifications',
		page: 'notifications',
		description:
			'Remove Hush notifications from a device when you use Hush there: "open" all of them when Hush opens, "item" each one when you open its PR or issue, or "never".'
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
		key: 'smartDecisions',
		page: 'inbox',
		description: `Hush asks Jev, a decision model, to read the title, labels, start of the description, and last 2 comments of your PRs and issues. Jev decides whether new comments need a reply from you, and checks the about: conditions of your categories, tags, and views (up to ${MAX_SMART_CONDITIONS}).`
	},
	{
		key: 'views',
		page: 'inbox',
		description:
			'Saved views: extra inbox tabs. Each is { "id", "name", "base", "query": a query }.'
	},
	{
		key: 'sources',
		page: 'dashboards',
		description:
			'The GitHub searches that decide which PRs and issues Hush tracks: { "id", "name", "query", "enabled" }. @me is you; @team runs once per tracked team. A search without is:pr or is:issue covers both.'
	},
	{
		key: 'categories',
		page: 'categories',
		description:
			'Where each PR, issue, and notification lives: exactly one category each. { "id", "name", "color", "rule": a query, "description": for Jev, "inbox": "auto" | "action" | "fyi" | "muted", "push": "inherit" | "on" | "off", "triage": "done" | "snooze", "snoozeHours" }. The first category whose rule matches wins; else Jev picks among categories with a description; else "other". "inbox", "push", and "triage" act on the inbox threads of the category.'
	},
	{
		key: 'tags',
		page: 'categories',
		description:
			'Marks that cut across categories: zero or more each. { "id", "name", "color", "rule": a query }. A rule with about:"…" asks Jev.'
	},
	{
		key: 'tracked',
		page: 'dashboards',
		description: 'Single PRs and issues to track, as "owner/repo#123", whatever the sources find.'
	},
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
		key: 'swipe.inbox',
		page: 'general',
		description:
			'On touch screens: what a swipe on an inbox thread does, { "left": …, "right": … }.'
	},
	{
		key: 'swipe.dash',
		page: 'general',
		description: 'What a swipe on a PR or issue does on the dashboards, the same way.'
	},
	{
		key: 'rows.pr',
		page: 'general',
		description:
			'Parts to hide on pull request rows, such as ["sources", "labels"]. Parts: time, author, comments, size, stack, ci, review, threads, conflicts, draft, moved, changes, category, tags, labels, sources.'
	},
	{
		key: 'rows.issue',
		page: 'general',
		description:
			'Parts to hide on issue rows. Parts: time, author, comments, moved, changes, category, tags, labels, sources.'
	},
	{
		key: 'rows.thread',
		page: 'general',
		description:
			'Parts to hide on inbox notification rows. Parts: time, why, changes, override, category, resolved, draft, snooze.'
	},
	{
		key: 'keys',
		page: 'keys',
		description:
			'Keyboard shortcuts you changed: { "command id": ["key", …] }, for example { "inbox.done": ["d"] }. [] turns a shortcut off. Keys: "j", "Shift+j", "Mod+k" (⌘ or Ctrl), "Enter", "Space", "?".'
	}
];

/** Settings that are objects of their own settings (a change to one key keeps the others). */
const GROUPS = new Set<keyof Settings>(['dash', 'menus', 'swipe', 'rows']);
/** Settings that change how threads are sorted: a change re-sorts the stored threads. */
export const RECLASSIFY_KEYS: (keyof Settings)[] = [
	'categories',
	'botsAreFyi',
	'reviewResolution',
	'teamReviewsAreAction',
	'smartDecisions'
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
	peekMarksRead: bool('peekMarksRead'),
	botsAreFyi: bool('botsAreFyi'),
	teamReviewsAreAction: bool('teamReviewsAreAction'),
	quietHours: validateQuietHours,
	pushRepeat: validatePushRepeat,
	pushDigestMinutes: validateDigestMinutes,
	pushLimit: validatePushLimit,
	pushWhileOpen: bool('pushWhileOpen'),
	pushUrgentNow: bool('pushUrgentNow'),
	smartDecisions: bool('smartDecisions'),
	clearNotifications: validateClearNotifications,
	reviewResolution: (v) =>
		v === 'strict' || v === 'any_review'
			? null
			: '"reviewResolution" must be "strict" or "any_review".',
	views: validateViews,
	dash: validateDash,
	sources: validateSources,
	categories: validateCategories,
	tags: validateTags,
	tracked: validateTracked,
	menus: validateMenus,
	keys: validateKeys,
	swipe: validateSwipe,
	rows: validateRows
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
	if (
		['views', 'categories', 'tags'].some((k) => keys.includes(k)) &&
		smartConditions(next.views, markQueries(next)).length > MAX_SMART_CONDITIONS
	)
		return `Views, categories, and tags can have up to ${MAX_SMART_CONDITIONS} different about: conditions.`;
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
	if (Array.isArray(raw.rules) && raw.rules.length)
		patch.categories = categoriesWithLegacyRules(
			(patch.categories as ItemCategory[] | undefined) ?? DEFAULT_CATEGORIES,
			raw.rules as LegacyInboxRule[]
		);
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
