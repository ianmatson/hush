import { NEW_COMMITS_AFTER_REVIEW_OPTIONS, validateDash } from './dashboard';
import { MAX_VIEW_SEARCHES, MAX_VIEWS, validateViews } from './item-views';
import {
	markQueries,
	MAX_CATEGORIES,
	MAX_CATEGORY_GROUPS,
	validateCategoryGroups
} from './categories';
import { MAX_SMART_CONDITIONS, smartConditions } from './decisions';
import { MENUS_VERSION, validateMenus } from './menus';
import { validateSwipe } from './swipe';
import { validateRows } from './row-parts';
import { validateKeys } from './keymap';
import { validateQuietHours } from './quiet';
import { PUSH_FACTS, validatePushFacts } from './push-facts';
import {
	DIGEST_MINUTES,
	validateClearNotifications,
	validateDigestMinutes,
	validatePushLimit,
	validatePushRepeat
} from './push-policy';
import { DEFAULT_SETTINGS } from './settings';
import type { Settings } from './types';

/**
 * Every setting, for the settings.json editor and the docs: one entry per key (and per key of
 * the `dash` and `menus` groups). `page` is where the UI shows it; null means JSON only.
 */
export type SettingsPage = 'inbox' | 'views' | 'categories' | 'notifications' | 'general' | 'keys';
export interface SettingInfo {
	key: string;
	page: SettingsPage | null;
	description: string;
}

export const SETTINGS_DOCS: SettingInfo[] = [
	{
		key: 'pushFacts',
		page: 'notifications',
		description: `What pushes: a list of facts. ${PUSH_FACTS.map((f) => `"${f.id}" (${f.label.toLowerCase()})`).join(', ')}.`
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
			'With smart decisions on: send a push at once, also during a digest or over the push limit, when the item’s text says it blocks something or is an incident. Quiet hours still hold it.'
	},
	{
		key: 'alertChannels.push',
		page: 'notifications',
		description: 'Send alerts as push notifications to your devices.'
	},
	{
		key: 'alertChannels.slack',
		page: 'notifications',
		description: 'Send alerts as Slack direct messages, when Slack is connected.'
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
		key: 'newCommitsAfterReview',
		page: null,
		description:
			'When new commits after your review make it your turn again. "always", "changes_requested": only when your last review asked for changes, or "never".'
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
		description: `Hush asks Jev, a decision model, to read the title, labels, start of the description, and last 2 comments of your PRs and issues. Jev decides whether new comments need a reply from you, places PRs and issues in the categories that have a description, and checks the about: conditions of your category rules (up to ${MAX_SMART_CONDITIONS}).`
	},
	{
		key: 'views',
		page: 'views',
		description: `The views in the top bar, in order (up to ${MAX_VIEWS}). Each is { "id", "name", "searches": up to ${MAX_VIEW_SEARCHES} GitHub searches, "groupBy": none, role, status, repo, author, label, assignee, category:<group id>, or project:<owner>/<number>, "pushNew": optional, true to push new items }. @me is you; @team runs once per tracked team. A search without is:pr or is:issue finds both.`
	},
	{
		key: 'categoryGroups',
		page: 'categories',
		description: `Groups of categories for PRs and issues (up to ${MAX_CATEGORY_GROUPS}). Each is { "id", "name", "categories" }, with up to ${MAX_CATEGORIES} categories of { "id", "name", "color", "icon", "rule": a query, "description": for Jev }. An item gets one category from each group: the first whose rule matches, else the one Jev picks among the categories with a description, else none ("Not sorted").`
	},
	{
		key: 'dash.excludedTeams',
		page: 'views',
		description: '"org/team" slugs that @team skips.'
	},
	{
		key: 'dash.staleDays',
		page: null,
		description: 'An item whose turn is older than this many days is marked stale (1 to 60).'
	},
	{
		key: 'dash.hideOthersDrafts',
		page: 'views',
		description: 'Hide draft PRs that you did not open.'
	},
	{
		key: 'dash.hideBots',
		page: 'views',
		description:
			'Hide PRs and issues that bots opened, unless your review is requested or you are assigned.'
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
			'Parts to hide on pull request rows, such as ["threads", "labels"]. Parts: time, author, external, comments, size, stack, ci, review, threads, conflicts, draft, moved, changes, categories, categoryNames, labels.'
	},
	{
		key: 'rows.issue',
		page: 'general',
		description:
			'Parts to hide on issue rows. Parts: time, author, external, comments, moved, changes, categories, categoryNames, labels.'
	},
	{
		key: 'rows.thread',
		page: 'general',
		description:
			'Parts to hide on inbox notification rows. Parts: time, why, changes, override, categories, categoryNames, resolved, draft, snooze.'
	},
	{
		key: 'keys',
		page: 'keys',
		description:
			'Keyboard shortcuts you changed: { "command id": ["key", …] }, for example { "inbox.done": ["d"] }. [] turns a shortcut off. Keys: "j", "Shift+j", "Mod+k" (⌘ or Ctrl), "Enter", "Space", "?".'
	}
];

/** Settings that are objects of their own settings (a change to one key keeps the others). */
const GROUPS = new Set<keyof Settings>(['dash', 'menus', 'swipe', 'rows', 'alertChannels']);
/** Settings that change how threads are sorted: a change re-sorts the stored threads. */
export const RECLASSIFY_KEYS: (keyof Settings)[] = [
	'botsAreFyi',
	'reviewResolution',
	'newCommitsAfterReview',
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
function validateAlertChannels(v: unknown): string | null {
	const channels = v as Record<string, unknown> | null;
	if (!channels || typeof channels !== 'object' || Array.isArray(channels))
		return '"alertChannels" must be { "push": true or false, "slack": true or false }.';
	for (const channel of ['push', 'slack'])
		if (typeof channels[channel] !== 'boolean')
			return `"alertChannels.${channel}" must be true or false.`;
	return null;
}

const CHECKS: Record<keyof Settings, (v: unknown) => string | null> = {
	pushFacts: validatePushFacts,
	peekMarksRead: bool('peekMarksRead'),
	botsAreFyi: bool('botsAreFyi'),
	teamReviewsAreAction: bool('teamReviewsAreAction'),
	quietHours: validateQuietHours,
	pushRepeat: validatePushRepeat,
	pushDigestMinutes: validateDigestMinutes,
	pushLimit: validatePushLimit,
	pushWhileOpen: bool('pushWhileOpen'),
	pushUrgentNow: bool('pushUrgentNow'),
	alertChannels: validateAlertChannels,
	smartDecisions: bool('smartDecisions'),
	clearNotifications: validateClearNotifications,
	reviewResolution: (v) =>
		v === 'strict' || v === 'any_review'
			? null
			: '"reviewResolution" must be "strict" or "any_review".',
	newCommitsAfterReview: (v) =>
		NEW_COMMITS_AFTER_REVIEW_OPTIONS.some((o) => o.id === v)
			? null
			: '"newCommitsAfterReview" must be "always", "changes_requested", or "never".',
	views: validateViews,
	dash: validateDash,
	categoryGroups: validateCategoryGroups,
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
		keys.includes('categoryGroups') &&
		smartConditions(markQueries(next)).length > MAX_SMART_CONDITIONS
	)
		return `Category rules can have up to ${MAX_SMART_CONDITIONS} different about: conditions.`;
	return null;
}

/**
 * The settings file: `hush` is the format version; `settings` has only your changes.
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
	if (file.hush === 1) return 'This settings file is from an older Hush. Export it again.';
	if (file.hush !== 2) return 'This settings file is from a newer Hush.';
	const raw = (file.settings ?? {}) as Record<string, unknown>;
	const patch = Object.fromEntries(
		Object.keys(DEFAULT_SETTINGS)
			.filter((k) => raw[k] !== undefined)
			.map((k) => [k, raw[k]])
	) as Partial<Settings>;
	return Object.keys(patch).length ? patch : 'The file has no settings.';
}
