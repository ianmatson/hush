import { GH_ACTIONS, MERGE_LABEL } from '$lib/shared/actions';
import { MAX_QUERIES } from '$lib/shared/turn';
import { COMMAND, COMMANDS, SCOPE_LABEL, keyText, type KeyScope } from '$lib/shared/keymap';
import { DEFAULT_MENU, MENU_ITEMS, SEP } from '$lib/shared/menus';
import { IS_VALUES, WORDS } from '$lib/shared/query';
import { DEFAULT_SEARCHES, DEFAULT_SETTINGS } from '$lib/shared/settings';
import { SETTINGS_DOCS, type SettingsPage } from '$lib/shared/settings-schema';
import { SNOOZE_EVENTS, SNOOZE_EVENT_MAX_MS } from '$lib/shared/snooze';
import { SESSION_DAYS, SESSION_IDLE_DAYS } from '$lib/shared/session';
import { MAX_SAVED } from '$lib/shared/search';
import { THEMES } from '$lib/themes/list';
import type { Settings } from '$lib/shared/types';
import {
	ALERT_LOG_KEEP,
	FINISHED_SHOW,
	FIRST_SYNC_DAYS,
	MAX_INDIVIDUAL_PUSHES,
	PAUSE_AFTER_NO_PUSH,
	PAUSE_AFTER_WITH_PUSH,
	POLL_ACTIVE,
	POLL_IDLE,
	SEARCH_EVERY,
	TEAMS_TTL,
	UPDATES_KEEP,
	WATCH_EVERY
} from '../../../worker/poller/shared';

/**
 * The generated parts of the docs: tables built from the same tables the app uses (settings,
 * keys, query words, menus, actions), so the docs cannot drift from the product. A docs page
 * asks for one with a line of its own: {{ref:settings}}.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Text for a table cell: pipes and line breaks would end the cell. */
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const code = (s: string) => `\`${s.replace(/`/g, "'")}\``;
const json = (v: unknown) => JSON.stringify(v);
const pretty = (v: unknown) => '```json\n' + JSON.stringify(v, null, 2) + '\n```';
const table = (head: string[], rows: string[][]) =>
	[
		`| ${head.join(' | ')} |`,
		`| ${head.map(() => '---').join(' | ')} |`,
		...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)
	].join('\n');

const PAGE: Record<SettingsPage, string> = {
	turn: 'Settings → Your turn',
	notifications: 'Settings → Notifications',
	advanced: 'Settings → Advanced',
	keys: 'Settings → Keybinds'
};

export const defaultOf = (key: keyof Settings): unknown => DEFAULT_SETTINGS[key];

/**
 * What the docs add to each setting: its type, and what it controls in more depth than the
 * one-line description in SETTINGS_DOCS. A test checks that every setting has an entry.
 */
export const SETTING_DETAILS: Record<keyof Settings, { type: string; body: string }> = {
	teamReviewsAreMine: {
		type: 'boolean',
		body: `A review request to a team you are in is **your turn** (and is pushed). Off, the request waits on the team: it shows in **Waiting**, under “Waiting on acme/web-core”. Teams that you exclude ([\`excludedTeams\`](#excludedteams)) do not count at all.`
	},
	reviewResolution: {
		type: '"strict" or "any_review"',
		body: `When a review request stops being your turn.

- \`"strict"\`: when GitHub no longer asks you: you reviewed, or the request was removed.
- \`"any_review"\`: also when someone other than you and the author approves or requests changes after the newest push. Useful on teams where one review is enough.

This also applies to team review requests. **Not my turn → “Someone else already reviewed it”** sets \`"any_review"\`.`
	},
	botsAreUpdates: {
		type: 'boolean',
		body: `PRs that bots open (dependabot, renovate, the Copilot coding agent…) are updates, and comments and mentions by bots do not count as replies. A review request to **you by name** still makes a bot's PR your turn. A bot is a login that ends in \`[bot]\`, or starts with dependabot, renovate, github-actions, or codecov.`
	},
	staleDays: {
		type: 'whole number, 1 to 60',
		body: `An item in Your turn or Waiting whose turn started more than this many days ago is **stale**: how long it waited shows in amber (“13d”).`
	},
	rules: {
		type: 'array of rules',
		body: `Your rules. Hush checks them from top to bottom, after its own placement. The first enabled rule that matches an item wins. A change to the rules places every stored item again. See [Rules](/docs/rules).

A rule:

- \`name\` (text, optional, up to 60 characters): shown on the item as “rule: …”.
- \`enabled\` (boolean, optional): \`false\` turns the rule off. Missing means on.
- \`when\` (text): a [query](/docs/query-language). \`""\` matches every item. \`is:done\`, \`is:snoozed\`, and \`is:muted\` work only in searches.
- \`then\` (object): what to do. It needs at least one of:
  - \`lane\`: \`"turn"\` (Your turn) or \`"updates"\`.
  - \`push\`: \`true\` or \`false\`, in place of the [\`push\`](#push) setting, when the item comes into Your turn.
  - \`mute\`: \`true\` hides the item from every lane (Search finds it with \`is:muted\`).
  - \`snoozeHours\`: a whole number from 1 to 720. When the item comes into Your turn, Hush snoozes it for this long.

Up to 100 rules.

\`\`\`json settings
{
  "rules": [
    { "name": "Docs repo is updates", "when": "repo:acme/website", "then": { "lane": "updates" } },
    { "name": "Mute dependabot", "when": "author:dependabot*", "then": { "mute": true } },
    { "name": "Nightly CI can wait", "when": "type:ci repo:acme/nightly", "then": { "snoozeHours": 12, "push": false } }
  ]
}
\`\`\``
	},
	push: {
		type: 'boolean',
		body: `When an item comes into **Your turn**, Hush pushes it to every device that has push on: once for each change of its turn. Waiting and Updates never push. A rule with \`"push": false\` stops the push for the items it matches, and \`"push": true\` pushes them with this setting off. To hear about something that is not your turn, give its rule \`"lane": "turn"\` too.`
	},
	pushResolved: {
		type: 'boolean',
		body: `When an alert from the last day is resolved (you approved, CI passes now, you chose Done on another device), Hush replaces it with a quiet alert such as “✓ You approved”, which then closes itself. Off: the old alert stays until you close it.`
	},
	quietHours: {
		type: 'object or null',
		body: `No pushes at these times. The alerts still go in the alert history (the bell). When quiet hours end, one push lists what waited.

- \`from\` and \`to\`: minutes after midnight, 0 to 1439. \`from\` later than \`to\` crosses midnight (22:00 to 07:00 is \`1320\` to \`420\`). They must differ.
- \`weekends\`: \`true\` also makes all of Saturday and Sunday quiet.
- \`timeZone\`: an IANA time zone name, such as \`"Europe/London"\` or \`"America/New_York"\`.

\`\`\`json settings
{ "quietHours": { "from": 1320, "to": 420, "weekends": true, "timeZone": "Europe/London" } }
\`\`\``
	},
	markReadOnGitHub: {
		type: 'boolean',
		body: `Keep GitHub in step with Hush: when you see an item (open it in the peek for a moment, open it on GitHub, or mark all Updates seen), Hush marks its notification **read** on GitHub; when you choose **Done**, it marks it **done** there. Off: Hush changes nothing on GitHub for these. Mute always unsubscribes you on GitHub.`
	},
	searches: {
		type: 'array of searches',
		body: `The GitHub searches Hush runs every ${SEARCH_EVERY / MIN} minutes, to find items with no recent notification (an old review request, your open PR). Each is a source of items, like your notifications; where an item goes still depends only on its turn. Up to 20.

- \`id\`: 1 to 40 lower-case letters, digits, or dashes. Unique.
- \`name\`: up to 60 characters.
- \`query\`: a [GitHub search](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests), 1 to 256 characters. \`@me\` is you. \`@team\` runs the search once for each team you track (15 at most).
- \`enabled\`: \`false\` skips the search.

A change replaces the whole list. The defaults:

${searchesReference()}`
	},
	searchScope: {
		type: 'string',
		body: `Added to the end of every tracked search, up to 200 characters. Use it to keep Hush to your work: \`"org:acme archived:false"\`, or \`"-repo:acme/website"\`.`
	},
	excludedTeams: {
		type: 'array of strings',
		body: `Teams to leave out, as \`"org/team"\` slugs: \`@team\` searches skip them, and their review requests do not count as yours or your team's. Hush finds your teams on GitHub (again every ${TEAMS_TTL / HOUR} hours); leave out big ones, such as “everyone”. One pass runs up to ${MAX_QUERIES} searches.

\`\`\`json settings
{ "excludedTeams": ["acme/everyone", "acme/contractors"] }
\`\`\``
	},
	saved: {
		type: 'array of saved searches',
		body: `Saved searches: tabs after the lanes, in this order. Up to ${MAX_SAVED}. Make them in [Search](/docs/search).

- \`id\`: 1 to 16 lower-case letters or digits. Unique. Feeds use it.
- \`name\`: up to 40 characters. The tab label.
- \`query\`: a [query](/docs/query-language), up to 300 characters. Here \`in:\` is the lane now, and \`is:done\`, \`is:snoozed\`, and \`is:muted\` find what you finished.

\`\`\`json settings
{
  "saved": [
    { "id": "web", "name": "Web reviews", "query": "repo:acme/web-* needs:review" },
    { "id": "alice", "name": "From Alice", "query": "from:alice" }
  ]
}
\`\`\``
	},
	keys: {
		type: 'object: command id → array of keys',
		body: `The keyboard shortcuts that you changed. For each [command id](/docs/keybinds#all-shortcuts), the keys that replace its default keys, up to 4. \`[]\` turns the shortcut off. Commands that you do not list keep their defaults.

How to write a key:

- Letters are lower case. Shift is a modifier: \`"Shift+j"\`, not \`"J"\`.
- Modifiers come first, in the order \`Mod\`, \`Alt\`, \`Shift\`. \`Mod\` is ⌘ on a Mac and Ctrl on other computers.
- Named keys: \`Enter\`, \`Escape\`, \`Space\`, \`Tab\`, \`Backspace\`, \`Delete\`, the arrows (\`ArrowUp\`…), \`Home\`, \`End\`, \`PageUp\`, \`PageDown\`, \`F1\` to \`F12\`.
- Other characters are themselves, with no Shift: \`"?"\`, \`"/"\`, \`"1"\`.

\`\`\`json settings
{ "keys": { "item.done": ["d", "e"], "item.mute": [], "palette": ["Mod+k", "Mod+p"] } }
\`\`\``
	},
	menu: {
		type: 'array of menu item ids',
		body: `The items of an item's right-click menu (and its “⋯” menu on phones), in order. \`"${SEP}"\` is a separator line. Items that you leave out are hidden. Items that do not apply to an item, such as Done for an item that is done, are left out when the menu opens. The ids are in [Menu items](/docs/appearance-and-menus#menu-items).

\`\`\`json settings
{ "menu": ["peek", "main", "sep", "done", "snooze:tomorrow", "until:ci_pass", "not-mine", "sep", "copy"] }
\`\`\``
	}
};

function searchesReference(): string {
	return table(
		['id', 'name', 'query', 'enabled'],
		DEFAULT_SEARCHES.map((s) => [code(s.id), s.name, code(s.query), String(s.enabled)])
	);
}

function settingsReference(): string {
	const overview = table(
		['Key', 'Type', 'Default', 'In the app'],
		SETTINGS_DOCS.map((d) => {
			const def = json(defaultOf(d.key));
			return [
				`[${code(d.key)}](#${slug(d.key)})`,
				SETTING_DETAILS[d.key]?.type ?? '',
				def.length > 40 ? '(see below)' : code(def),
				d.page ? PAGE[d.page] : 'settings.json only'
			];
		})
	);
	const each = SETTINGS_DOCS.map((d) => {
		const def = defaultOf(d.key);
		const text = json(def);
		const detail = SETTING_DETAILS[d.key];
		return [
			`### ${d.key}`,
			`**Type:** ${detail?.type ?? ''} · **Default:** ${text.length > 60 ? 'below' : code(text)} · **In the app:** ${d.page ? PAGE[d.page] : 'none (settings.json only)'}`,
			d.description,
			detail?.body ?? '',
			text.length > 60 && d.key !== 'searches' ? `The default:\n\n${pretty(def)}` : ''
		]
			.filter(Boolean)
			.join('\n\n');
	});
	return ['## All settings', overview, '## Every setting', ...each].join('\n\n');
}

const keysOf = (id: string) => COMMAND.get(id)?.keys ?? [];

/**
 * A command's default keys in running text, the way the app shows them: `E`, or `O` or `Enter`.
 * A key with Mod names both forms: `⌘ S` / `Ctrl + S`.
 */
export function keyMention(id: string, where = 'docs'): string {
	const c = COMMAND.get(id);
	if (!c) throw new Error(`${where}: unknown command "${id}"`);
	const one = (k: string) =>
		k.includes('Mod')
			? `${code(keyText(k, true))} / ${code(keyText(k, false))}`
			: code(keyText(k, false));
	return c.keys.length ? c.keys.map(one).join(' or ') : '(no key)';
}

/** Some commands and their keys, in this order: {{ref:keys list.next item.done}}. */
function someKeys(ids: string[]): string {
	return table(
		['Key', 'What it does'],
		ids.map((id) => [keyMention(id), COMMAND.get(id)!.label])
	);
}

function keybindsReference(): string {
	const scopes = Object.keys(SCOPE_LABEL) as KeyScope[];
	return scopes
		.map((scope) => {
			const rows = COMMANDS.filter((c) => c.scope === scope).map((c) => [
				code(c.id),
				c.label,
				c.keys.length ? c.keys.map(code).join(', ') : 'none'
			]);
			return `### ${SCOPE_LABEL[scope]}\n\n${table(['Command id', 'What it does', 'Default keys'], rows)}`;
		})
		.join('\n\n');
}

function queryReference(): string {
	const words = table(
		['Word', 'Filters on', 'Example'],
		[
			...WORDS.map((w) => [code(`${w.key}:`), w.help, code(w.example)]),
			[
				code('is:'),
				'Draft, open, closed, merged; in searches also done, snoozed, muted',
				code('is:draft')
			],
			[
				'other words',
				'Words that must all be in the title, repository, or author',
				code('login bug')
			]
		]
	);
	const values = WORDS.filter((w) => w.values)
		.map((w) => {
			const rows = Object.entries(w.values!).map(([word, v]) => [code(word), v.help]);
			return `### ${w.key}:\n\n${w.help}.\n\n${table(['Value', 'Means'], rows)}`;
		})
		.join('\n\n');
	const is = table(
		['Value', 'Means'],
		Object.entries(IS_VALUES).map(([k, help]) => [code(`is:${k}`), help])
	);
	return `${words}\n\n## Values\n\n${values}\n\n### is:\n\n${is}\n\n${code('-is:draft')} is “not a draft”.`;
}

function menusReference(): string {
	const rows = MENU_ITEMS.map((i) => [
		code(i.id),
		i.label,
		i.note ?? '',
		DEFAULT_MENU.includes(i.id) ? 'yes' : 'no'
	]);
	return `${table(['Id', 'Item', 'Shows', 'In the default menu'], rows)}\n\nThe default order: ${code(json(DEFAULT_MENU))}`;
}

function snoozeReference(): string {
	return table(
		['Snooze until', 'For', 'Menu id'],
		SNOOZE_EVENTS.map((e) => [
			e.label,
			e.kinds.includes('issue') ? 'Pull requests and issues' : 'Pull requests',
			code(`until:${e.id}`)
		])
	);
}

function actionsReference(): string {
	return table(
		['Action', 'Default key', 'Text', 'Safety'],
		Object.values(GH_ACTIONS).map((a) => [
			a.label,
			a.command ? keysOf(a.command).map(code).join(', ') : 'none (in “More”)',
			a.body === 'required' ? 'required' : a.body === 'optional' ? 'optional' : '',
			a.confirm
				? 'Asks again: press twice'
				: a.undo === 'delay'
					? 'Sent after 5 seconds; Undo stops it'
					: a.undo
						? `Undo: ${GH_ACTIONS[a.undo].label.toLowerCase()}`
						: ''
		])
	);
}

function limitsReference(): string {
	const dur = (ms: number) =>
		ms >= DAY ? `${ms / DAY} days` : ms >= HOUR ? `${ms / HOUR} hours` : `${ms / MIN} minutes`;
	return table(
		['What', 'Limit'],
		[
			['Check for new notifications, when Hush is open or push is on', `every ${dur(POLL_ACTIVE)}`],
			['Check when idle (no open tab for 15 minutes, no push devices)', `every ${dur(POLL_IDLE)}`],
			[
				'First sync after sign-in',
				`the tracked searches, then notifications from the last ${FIRST_SYNC_DAYS} days`
			],
			['The watcher (turn changes with no notification)', `every ${dur(WATCH_EVERY)}`],
			['Tracked searches', `every ${dur(SEARCH_EVERY)}`],
			['Your teams', `looked up again every ${dur(TEAMS_TTL)}`],
			[
				'Checks stop with no visit for',
				`${dur(PAUSE_AFTER_NO_PUSH)} (${dur(PAUSE_AFTER_WITH_PUSH)} with push devices); opening Hush starts them again`
			],
			['Updates show', `the last ${dur(UPDATES_KEEP)}`],
			['“Hush finished these for you”', `items from the last ${dur(FINISHED_SHOW)}`],
			['A snooze “until something happens” also ends after', dur(SNOOZE_EVENT_MAX_MS)],
			[
				'Pushes at once before they become one push (“5 things are your turn”)',
				String(MAX_INDIVIDUAL_PUSHES)
			],
			['Alert history (the bell)', dur(ALERT_LOG_KEEP)],
			['Updates, and Done or muted items, with no activity are deleted after', '30 days'],
			['Saved searches', String(MAX_SAVED)],
			['Rules', '100'],
			['Tracked searches', '20'],
			['GitHub searches in one pass', String(MAX_QUERIES)],
			['Items per menu', '60'],
			['Keys per command', '4'],
			['Push devices', '10'],
			['Rule snooze (snoozeHours)', '1 to 720 hours'],
			[
				'Session',
				`${SESSION_IDLE_DAYS} days with no use, or ${SESSION_DAYS} days after sign-in; then sign in again`
			]
		]
	);
}

export const REFERENCES: Record<string, (args: string[]) => string> = {
	keys: someKeys,
	themes: () => ['Default', ...THEMES.map((t) => t.label)].map((l) => `- ${l}`).join('\n'),
	settings: settingsReference,
	searches: searchesReference,
	keybinds: keybindsReference,
	query: queryReference,
	menus: menusReference,
	snooze: snoozeReference,
	actions: actionsReference,
	limits: limitsReference,
	'merge-methods': () =>
		Object.values(MERGE_LABEL)
			.map((l) => `- ${l}`)
			.join('\n')
};

/** The id of a heading: lower case, words joined with dashes. */
export function slug(text: string): string {
	return text
		.toLowerCase()
		.replace(/<[^>]+>/g, '')
		.replace(/&[a-z]+;/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}
