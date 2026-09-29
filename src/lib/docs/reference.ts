import { GH_ACTIONS, MERGE_LABEL } from '$lib/shared/actions';
import { DEFAULT_ISSUE_SECTIONS, DEFAULT_PR_SECTIONS, MAX_QUERIES } from '$lib/shared/dashboard';
import { COMMAND, COMMANDS, SCOPE_LABEL, keyText, type KeyScope } from '$lib/shared/keymap';
import { DEFAULT_MENUS, MENU_ITEMS, SEP, type MenuKind } from '$lib/shared/menus';
import { IS_VALUES, WORDS } from '$lib/shared/query';
import { DEFAULT_SETTINGS } from '$lib/shared/settings';
import { SETTINGS_DOCS, type SettingsPage } from '$lib/shared/settings-schema';
import { SNOOZE_EVENTS, SNOOZE_EVENT_MAX_MS } from '$lib/shared/snooze';
import { SESSION_DAYS, SESSION_IDLE_DAYS } from '$lib/shared/session';
import { MAX_VIEWS, VIEW_BASES } from '$lib/shared/views';
import { THEMES } from '$lib/themes/list';
import { SWIPE_ACTIONS } from '$lib/shared/swipe';
import { REOPEN_WINDOW_MS } from '$lib/shared/watch';
import {
	ALERT_LOG_KEEP,
	DASH_TTL,
	FIRST_SYNC_DAYS,
	MAX_INDIVIDUAL_PUSHES,
	PAUSE_AFTER_NO_PUSH,
	PAUSE_AFTER_WITH_PUSH,
	POLL_ACTIVE,
	POLL_IDLE,
	TEAMS_TTL,
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
	general: 'Settings → General',
	inbox: 'Settings → Inbox',
	dashboards: 'Settings → PRs & issues',
	notifications: 'Settings → Notifications',
	keys: 'Settings → Keybinds'
};

/** The default of a setting key, also of a group key such as "dash.pr". */
export function defaultOf(key: string): unknown {
	const [group, sub] = key.split('.');
	const v = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[group];
	return sub ? (v as Record<string, unknown>)[sub] : v;
}

/**
 * What the docs add to each setting: its type, and what it controls in more depth than the
 * one-line description in SETTINGS_DOCS. A test checks that every setting has an entry.
 */
export const SETTING_DETAILS: Record<string, { type: string; body: string }> = {
	pushAction: {
		type: 'boolean',
		body: `When a thread arrives in **Needs you**, Hush sends a push to every device that has push on. A rule with \`"push": false\` stops the push for the threads it matches; with \`"push": true\` it sends one even when this is off.`
	},
	pushFyi: {
		type: 'boolean',
		body: `Also push FYI threads. Most people leave this off and write a rule with \`"push": true\` for the few repositories or people they care about.`
	},
	pushTurnChanges: {
		type: 'boolean',
		body: `GitHub sends no notification for some changes that make a thread your turn: new commits after your review, CI that fails later, a snooze that ends. The inbox watcher looks at open threads every ${WATCH_EVERY / MIN} minutes. When one of them becomes your turn, Hush moves it to Needs you and, with this on, pushes it.`
	},
	pushResolved: {
		type: 'boolean',
		body: `When an alert from the last day is resolved (you approved, CI passes now, you marked it Done on another device), Hush replaces it with a quiet alert such as “✓ You approved”, which then closes itself. Off: the old alert stays until you close it.`
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
	peekMarksRead: {
		type: 'boolean',
		body: `A PR or issue that stays open in the peek for 1.5 seconds is marked as read, in Hush and on GitHub. Off: only **Read** (or opening it on GitHub) marks it.`
	},
	reviewResolution: {
		type: '"strict" or "any_review"',
		body: `When a review request stops being your turn.

- \`"strict"\`: when GitHub no longer asks you: you reviewed, or the request was removed.
- \`"any_review"\`: also when someone other than you and the author approves or requests changes after the newest push. Useful on teams where one review is enough.

This also applies to team review requests.`
	},
	botsAreFyi: {
		type: 'boolean',
		body: `PRs that bots open (dependabot, renovate…) are FYI, and they show in Other on the Pull requests tab, unless they ask for your review by name. Comments and mentions by bots do not count as replies. A bot is a login that ends in \`[bot]\`, or starts with dependabot, renovate, github-actions, or codecov.`
	},
	teamReviewsAreAction: {
		type: 'boolean',
		body: `A review request to a team you are in goes to **Needs you** (and is pushed). Off, it is FYI in the inbox, and it shows under “Your team's turn” on the Pull requests tab.`
	},
	rules: {
		type: 'array of rules',
		body: `Your inbox rules. Hush checks them from top to bottom, after its own defaults. The first enabled rule that matches a thread wins. A change to the rules sorts your stored threads again. See [Rules](/docs/rules) for the editor, and [the query language](/docs/query-language) for the conditions.

A rule:

- \`name\` (text, optional): shown on the thread as “rule: …”.
- \`enabled\` (boolean, optional): \`false\` turns the rule off. Missing means on.
- \`when\` (text): a [query](/docs/query-language), such as \`"repo:acme/* needs:review"\`. All of its conditions must match. \`""\` matches every thread. A query with a part that Hush does not understand is refused.
- \`then\` (object): what to do. It needs at least one of \`category\`, \`push\`, or \`triage\`.
  - \`category\`: \`"action"\` (Needs you), \`"fyi"\`, or \`"muted"\`.
  - \`push\`: \`true\` or \`false\`, in place of the push settings.
  - \`triage\`: \`"done"\` moves the thread to Done, \`"snooze"\` snoozes it for \`snoozeHours\` (a whole number from 1 to 720). Hush moves a thread only when it has new activity or when the rule starts to match, so a thread that you move back stays where you put it.

\`\`\`json settings
{
  "rules": [
    { "name": "Docs repo is FYI", "when": "repo:acme/website", "then": { "category": "fyi" } },
    { "name": "Mute dependabot", "when": "author:dependabot*", "then": { "category": "muted" } },
    {
      "name": "Nightly CI can wait",
      "when": "type:ci repo:acme/nightly",
      "then": { "triage": "snooze", "snoozeHours": 12, "push": false }
    }
  ]
}
\`\`\``
	},
	views: {
		type: 'array of views',
		body: `Saved views: extra tabs after the built-in inbox tabs, in this order. Up to ${MAX_VIEWS}.

- \`id\`: 1 to 16 lower-case letters or digits. Unique. Feeds and links use it.
- \`name\`: up to 40 characters. The tab label.
- \`base\`: the list the view starts from: ${VIEW_BASES.map((b) => `\`"${b.id}"\` (${b.label})`).join(', ')}.
- \`query\`: a [query](/docs/query-language), the same words as rules. \`in:\` here is the thread's list now, after your rules. \`""\` shows every thread of the base.

\`\`\`json settings
{
  "views": [
    { "id": "web", "name": "Web team", "base": "inbox", "query": "repo:acme/web-*" },
    { "id": "ci", "name": "Broken CI", "base": "action", "query": "needs:fix-ci" }
  ]
}
\`\`\``
	},
	'dash.pr': {
		type: 'array of sections',
		body: `The sections of the Pull requests tab. Each is a saved GitHub search. Up to 20.

- \`id\`: 1 to 40 lower-case letters, digits, or dashes. Unique.
- \`name\`: up to 60 characters.
- \`query\`: a [GitHub search](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests), 1 to 256 characters. \`@me\` is you. \`@team\` runs the search once for each team you track.
- \`enabled\`: \`false\` hides the section and skips its search.

A change to \`dash.pr\` replaces the whole list. To add a section, write the defaults below and your new one.

The defaults:

${table(
	['id', 'name', 'query', 'enabled'],
	DEFAULT_PR_SECTIONS.map((s) => [code(s.id), s.name, code(s.query), String(s.enabled)])
)}`
	},
	'dash.issue': {
		type: 'array of sections',
		body: `The sections of the Issues tab, the same as \`dash.pr\`. The defaults:

${table(
	['id', 'name', 'query', 'enabled'],
	DEFAULT_ISSUE_SECTIONS.map((s) => [code(s.id), s.name, code(s.query), String(s.enabled)])
)}`
	},
	'dash.scope': {
		type: 'string',
		body: `Added to the end of every section's search, up to 200 characters. Use it to keep the tabs to your work: \`"org:acme archived:false"\`, or \`"-repo:acme/website"\`.`
	},
	'dash.excludedTeams': {
		type: 'array of strings',
		body: `Teams that \`@team\` sections skip, as \`"org/team"\` slugs. Hush finds your teams on GitHub (again every ${TEAMS_TTL / HOUR} hours); turn off big ones, such as “everyone”, to cut noise. A section searches the first 15 teams at most, and one tab runs up to ${MAX_QUERIES} searches.

\`\`\`json settings
{ "dash": { "excludedTeams": ["acme/everyone", "acme/contractors"] } }
\`\`\``
	},
	'dash.staleDays': {
		type: 'whole number, 1 to 60',
		body: `An item whose turn started more than this many days ago is **stale**: it shows how long it waited (“waiting 5d”) in amber. Items in the Other group are never stale.`
	},
	'dash.hideOthersDrafts': {
		type: 'boolean',
		body: `Leave out draft PRs that someone else opened. Your own drafts always show (in Other).`
	},
	'dash.hideBots': {
		type: 'boolean',
		body: `Leave out PRs and issues that bots opened, unless your review is requested from you by name.`
	},
	'menus.inbox': {
		type: 'array of menu item ids',
		body: `The items of the right-click menu (and the “⋯” menu on phones) of inbox threads, in order. \`"${SEP}"\` is a separator line. Items that you leave out are hidden. Items that do not apply to a thread, such as Done in the Done tab, are left out when the menu opens. See the item ids in [Menus](/docs/appearance-and-menus#menu-items).

\`\`\`json settings
{ "menus": { "inbox": ["peek", "main", "sep", "done", "snooze:tomorrow", "until:ci_pass", "mute", "sep", "copy"] } }
\`\`\`

Hush adds \`"v"\` (the menu version) next to your menus. Leave it: it tells Hush which new items you have already seen.`
	},
	'menus.dash': {
		type: 'array of menu item ids',
		body: `The menu of pull requests and issues on the dashboards, the same way as \`menus.inbox\`.`
	},
	'swipe.inbox': {
		type: '{ "left": action, "right": action }',
		body: `On a phone or tablet, swipe an inbox thread to the right or to the left to act on it: the row moves with your finger, shows the action, and acts when you let go past the line. A mouse or pen never swipes (on the dashboards it drags). The actions: ${SWIPE_ACTIONS.inbox.map((a) => `\`"${a.id}"\` (${a.label})`).join(', ')}.

\`\`\`json settings
{ "swipe": { "inbox": { "right": "done", "left": "mute" } } }
\`\`\``
	},
	'swipe.dash': {
		type: '{ "left": action, "right": action }',
		body: `The same for pull requests and issues on the dashboards. The actions: ${SWIPE_ACTIONS.dash.map((a) => `\`"${a.id}"\` (${a.label})`).join(', ')}.`
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
{ "keys": { "inbox.done": ["d", "e"], "inbox.mute": [], "palette": ["Mod+k", "Mod+p"] } }
\`\`\``
	}
};

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
			text.length > 60 && !d.key.startsWith('dash.') ? `The default:\n\n${pretty(def)}` : ''
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

/** Some commands and their keys, in this order: {{ref:keys list.next inbox.done}}. */
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
		['Word', 'Filters on', 'Example', 'JSON condition'],
		[
			...WORDS.map((w) => [
				code(`${w.key}:`),
				w.help,
				code(w.example),
				w.bots ? `${code(w.field)}; ${code(`${w.key}:bots`)} sets ${code(w.bots)}` : code(w.field)
			]),
			[
				code('is:'),
				'Draft, open, closed, or merged',
				code('is:draft'),
				`${code('draft')}, ${code('state')}`
			],
			[
				'other words',
				'Words that must all be in the title, repository, or author',
				code('login bug'),
				code('text')
			]
		]
	);
	const values = WORDS.filter((w) => w.values)
		.map((w) => {
			const rows = Object.entries(w.values!).map(([word, v]) => [
				code(word),
				v.help,
				code(json(v.stored))
			]);
			return `### ${w.key}:\n\n${w.help}.\n\n${table(['Value', 'Means', 'In JSON'], rows)}`;
		})
		.join('\n\n');
	const is = table(
		['Value', 'Means', 'In JSON'],
		Object.entries(IS_VALUES).map(([k, help]) => [
			code(`is:${k}`),
			help,
			code(k === 'draft' ? '"draft": true' : `"state": ["${k}"]`)
		])
	);
	return `${words}\n\n## Values\n\n${values}\n\n### is:\n\n${is}\n\n${code('-is:draft')} is \`"draft": false\`.`;
}

function menusReference(): string {
	return (['inbox', 'dash'] as MenuKind[])
		.map((kind) => {
			const rows = MENU_ITEMS[kind].map((i) => [
				code(i.id),
				i.label,
				i.note ?? '',
				DEFAULT_MENUS[kind].includes(i.id) ? 'yes' : 'no'
			]);
			const title =
				kind === 'inbox' ? 'Inbox threads (menus.inbox)' : 'PRs and issues (menus.dash)';
			return `### ${title}\n\n${table(['Id', 'Item', 'Shows', 'In the default menu'], rows)}\n\nThe default order: ${code(json(DEFAULT_MENUS[kind]))}`;
		})
		.join('\n\n');
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
			['Poll for new notifications, when Hush is open or push is on', `every ${dur(POLL_ACTIVE)}`],
			['Poll when idle (no open tab for 15 minutes, no push devices)', `every ${dur(POLL_IDLE)}`],
			['First sync after sign-in', `notifications from the last ${FIRST_SYNC_DAYS} days`],
			['Inbox watcher (turn changes with no notification)', `every ${dur(WATCH_EVERY)}`],
			['Pull requests and Issues tabs', `cached for ${dur(DASH_TTL)}; refresh any time`],
			['Your teams', `looked up again every ${dur(TEAMS_TTL)}`],
			[
				'Polling stops with no visit for',
				`${dur(PAUSE_AFTER_NO_PUSH)} (${dur(PAUSE_AFTER_WITH_PUSH)} with push devices); opening Hush starts it again`
			],
			['A Done thread comes back when it needs you again, within', dur(REOPEN_WINDOW_MS)],
			['A snooze “until something happens” also ends after', dur(SNOOZE_EVENT_MAX_MS)],
			[
				'Pushes per poll before they become one push (“5 things need you”)',
				String(MAX_INDIVIDUAL_PUSHES)
			],
			['Alert history (the bell)', dur(ALERT_LOG_KEEP)],
			['Done threads with no activity are forgotten after', '30 days'],
			['Saved views', String(MAX_VIEWS)],
			['Sections per tab (dash.pr, dash.issue)', '20'],
			['GitHub searches per tab', String(MAX_QUERIES)],
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
		.replace(/['’]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}
