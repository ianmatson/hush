import { GH_ACTIONS, MERGE_LABEL } from '$lib/shared/actions';
import { MAX_QUERIES } from '$lib/shared/dashboard';
import {
	DEFAULT_VIEWS,
	MAX_SEARCH_CHARS,
	MAX_VIEW_NAME_CHARS,
	MAX_SECTION_NAME_CHARS,
	MAX_VIEW_SEARCHES,
	MAX_VIEW_SECTIONS,
	MAX_VIEWS
} from '$lib/shared/item-views';
import {
	DEFAULT_CATEGORY_GROUPS,
	MARK_COLORS,
	MAX_CATEGORIES,
	MAX_CATEGORY_GROUPS,
	MAX_DESCRIPTION_CHARS,
	MAX_MARK_NAME_CHARS
} from '$lib/shared/categories';
import { COMMAND, COMMANDS, SCOPE_LABEL, keyText, type KeyScope } from '$lib/shared/keymap';
import { DEFAULT_MENUS, MENU_ITEMS, SEP, type MenuKind } from '$lib/shared/menus';
import {
	IS_VALUES,
	MAX_CONDITION_CHARS,
	WORDS,
	wordWorksIn,
	type QueryWord
} from '$lib/shared/query';
import { BODY_EXCERPT_CHARS, MAX_SMART_CONDITIONS, YES_AT } from '$lib/shared/decisions';
import { DEFAULT_DAILY_TOKENS } from '../../../worker/decide';
import { DEFAULT_SETTINGS } from '$lib/shared/settings';
import { SETTINGS_DOCS, type SettingsPage } from '$lib/shared/settings-schema';
import { SNOOZE_EVENTS, SNOOZE_EVENT_MAX_MS } from '$lib/shared/snooze';
import { SESSION_DAYS, SESSION_IDLE_DAYS } from '$lib/shared/session';
import { THEMES } from '$lib/themes/list';
import { SWIPE_ACTIONS } from '$lib/shared/swipe';
import { DEFAULT_PUSH_FACTS, PUSH_FACTS } from '$lib/shared/push-facts';
import { DEFAULT_ROWS, ROW_PARTS } from '$lib/shared/row-parts';
import {
	ALERT_LOG_KEEP,
	DASH_TTL,
	FILL_MAX,
	MAX_INDIVIDUAL_PUSHES,
	PAUSE_AFTER_NO_PUSH,
	PAUSE_AFTER_WITH_PUSH,
	POLL_ACTIVE,
	POLL_IDLE,
	TEAMS_TTL,
	TRACKED_KEEP,
	TRACKED_REBUILD_GAP
} from '../../../worker/poller/shared';
import {
	APP_FOCUS_LASTS_MS,
	DIGEST_MINUTES,
	LIMIT_COUNT,
	LIMIT_MINUTES
} from '$lib/shared/push-policy';

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
	views: 'Settings → Views',
	categories: 'Settings → Categories',
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
	pushFacts: {
		type: 'list of strings',
		body: `The facts that push. Each time Hush reads a pull request or issue from GitHub, it compares it with the last read, and pushes when one of these facts became true:

${table(
	['Fact', 'Pushes when'],
	PUSH_FACTS.map((f) => [code(f.id), f.note ? `${f.label}. ${f.note}` : `${f.label}.`])
)}

The default: ${code(json(DEFAULT_PUSH_FACTS))}. An empty list pushes nothing (except the new items of views with \`pushNew\`). See [What gets pushed](/docs/notifications#what-gets-pushed).

\`\`\`json settings
{ "pushFacts": ["review-requested", "mentioned", "ci-failed"] }
\`\`\``
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
	pushRepeat: {
		type: '"once", "reason", or "every"',
		body: `When one PR or issue can push again. Hush keeps one notification for each PR or issue, and a later push replaces it.

- \`"once"\` (default): one push, then nothing more for that item until you open it in Hush.
- \`"reason"\`: the same, but a new reason pushes again, for example when "Review requested" becomes "Changes requested".
- \`"every"\`: each update pushes.

A snooze that ends always pushes.

\`\`\`json settings
{ "pushRepeat": "reason" }
\`\`\``
	},
	pushDigestMinutes: {
		type: 'number or null',
		body: `Send pushes together: what comes in waits, and one push lists it every this many minutes (${DIGEST_MINUTES.min} to ${DIGEST_MINUTES.max}). Hush checks GitHub every ${POLL_ACTIVE / MIN} minutes, so a digest can come a few minutes late. \`null\` (default): each push goes at once.

\`\`\`json settings
{ "pushDigestMinutes": 60 }
\`\`\``
	},
	pushLimit: {
		type: 'object or null',
		body: `A limit for busy days: after \`count\` pushes in \`minutes\`, the rest wait, and one push lists them when there is room again. \`count\` is ${LIMIT_COUNT.min} to ${LIMIT_COUNT.max}; \`minutes\` is ${LIMIT_MINUTES.min} to ${LIMIT_MINUTES.max}. \`null\` (default): no limit.

\`\`\`json settings
{ "pushLimit": { "count": 6, "minutes": 30 } }
\`\`\``
	},
	pushWhileOpen: {
		type: 'boolean',
		body: `Off (default): while you use Hush on any device, new items show in Hush and do not push. Hush counts as in use when its tab or app has focus and you used it in the last ${APP_FOCUS_LASTS_MS / MIN} minutes. On: pushes go at all times.`
	},
	'alertChannels.push': {
		type: 'boolean',
		body: `On (default): alerts go as push notifications to your devices. Turn it off to get alerts only in Slack.

\`\`\`json settings
{ "alertChannels": { "push": false } }
\`\`\``
	},
	'alertChannels.slack': {
		type: 'boolean',
		body: `On (default): when Slack is connected (**Settings → Notifications → Slack**), each alert also goes as a direct message from the Hush app. A digest is one message with a list. Quiet hours, digests, and the limit apply to Slack as they do to push.`
	},
	clearNotifications: {
		type: '"open", "item", or "never"',
		body: `Remove Hush notifications from a device when you use Hush there.

- \`"open"\` (default): all of them, each time Hush opens or comes to the front.
- \`"item"\`: each one when you open its PR or issue in the peek.
- \`"never"\`: they stay until you close them.

iPhone and iPad can ignore this: Safari on iOS does not always remove a notification when Hush asks.`
	},
	smartDecisions: {
		type: 'boolean',
		body: `On by default. Hush asks Jev, a decision model from TypeSafe (through Cloudflare Workers AI), to read the title, labels, first ${BODY_EXCERPT_CHARS} characters of the description, and last 2 comments of your PRs and issues. Jev never sees code, CI, or reviews, and writes nothing.

- **Comments that need nothing from you:** when the newest comments by other people (not bots) are thanks, approval, a status update, or +1, they no longer make it your turn. Jev must be at least ${YES_AT * 100}% sure; when it is not, Hush does what it did before.
- **Categories:** Jev places each PR and issue in the categories that have a description, when no rule places it. See [Categories](/docs/categories).
- **\`about:\` conditions** in category rules: Jev checks whether each PR or issue is about what you wrote. See [the query language](/docs/query-language).
- **Order:** in your views, items whose text says they block something or are about an incident come first inside their section.

A one-time notice on your views says that this is on. When you turn it on, or add an \`about:\` condition, Hush checks the PRs and issues of your views again (up to ${FILL_MAX}). Each account can use up to ${DEFAULT_DAILY_TOKENS.toLocaleString('en-US')} tokens a day; after that, smart decisions pause until 00:00 UTC, and everything else works as before. Turn it off in **Settings → Categories → Smart decisions**: Hush then deletes Jev's answers, and sends Jev nothing more.`
	},
	pushUrgentNow: {
		type: 'boolean',
		body: `Needs **smartDecisions**. On, a push about an item whose text says it blocks something or is about an incident goes at once, also during a digest (**pushDigestMinutes**) or over the push limit (**pushLimit**). Quiet hours still hold it. Off by default.`
	},
	views: {
		type: 'array of views',
		body: `The views in the top bar, in this order. Up to ${MAX_VIEWS}. A view shows the open PRs and issues that its searches find.

- \`id\`: 1 to 40 lower-case letters, digits, or dashes. Unique. The view's page (\`/v/<id>\`) and feed use it.
- \`name\`: up to ${MAX_VIEW_NAME_CHARS} characters. The tab label.
- \`searches\`: up to ${MAX_VIEW_SEARCHES} searches in the [query language](/docs/query-language#in-a-views-search), 1 to ${MAX_SEARCH_CHARS} characters each. Hush sends the GitHub words to GitHub and checks the Hush words on the results. \`@me\` is you. \`@team\` runs the search once for each team you track. A search with \`is:pr\` (or a PR-only word such as \`review-requested:\`) finds pull requests; with \`is:issue\`, issues; with neither, both. Hush adds \`archived:false\` unless the search says \`archived:\`.
- \`pushNew\` (optional, \`false\` when left out): push when a pull request or issue shows up in the view for the first time. Items that you opened do not push.
- \`groupBy\`: how the view puts its list into sections: \`"none"\`, \`"role"\` (your role), \`"status"\`, \`"repo"\`, \`"author"\`, \`"label"\`, \`"assignee"\`, \`"custom"\` (the view's own \`sections\`), \`"category:<group id>"\`, or \`"project:<owner>/<number>"\` (the Status of a GitHub project, such as \`"project:acme/7"\`). See [Group by](/docs/pull-requests-and-issues#group-by). The **Group by** button on the view changes it.
- \`sections\` (optional): up to ${MAX_VIEW_SECTIONS} custom sections, each \`{ "name", "rule" }\`: a unique name of up to ${MAX_SECTION_NAME_CHARS} characters, and a rule in the [query language](/docs/query-language). An item goes into the first section whose rule matches, then **Everything else**. \`"groupBy": "custom"\` needs at least one. See [Custom sections](/docs/pull-requests-and-issues#custom-sections).
A view needs at least one search, and you keep at least one view.

Hush runs the searches about every ${DASH_TTL / MIN} minutes while it checks GitHub. A notification about a PR or issue that Hush does not track yet runs them again, at most every ${TRACKED_REBUILD_GAP / MIN} minutes. An item that the searches stop finding stays tracked for ${TRACKED_KEEP / DAY} days. When you change \`views\`, the items that no view finds now stop at once.

A change to \`views\` replaces the whole list. To add a view, write the defaults below and your new one.

\`\`\`json settings
{
  "views": [
    {
      "id": "mine",
      "name": "Mine",
      "searches": ["is:open involves:@me", "is:pr is:open review-requested:@me"], "groupBy": "role"
    },
    {
      "id": "website",
      "name": "Website",
      "searches": ["repo:acme/website is:open"],
      "groupBy": "custom",
      "sections": [
        { "name": "Failing CI", "rule": "status:failure" },
        { "name": "Small", "rule": "size:<50" }
      ]
    }
  ]
}
\`\`\`

The default:

${viewsReference()}`
	},
	categoryGroups: {
		type: 'array of category groups',
		body: `Groups of categories for your PRs and issues. Up to ${MAX_CATEGORY_GROUPS} groups.

Each group has:

- \`id\`: 1 to 40 lower-case letters, digits, or dashes. Unique.
- \`name\`: up to ${MAX_MARK_NAME_CHARS} characters.
- \`categories\`: up to ${MAX_CATEGORIES} categories, in order.

Each category has:

- \`id\`: 1 to 40 lower-case letters, digits, or dashes. Unique across all groups.
- \`name\`: up to ${MAX_MARK_NAME_CHARS} characters.
- \`color\`: ${MARK_COLORS.map((c) => `\`"${c}"\``).join(', ')}.
- \`icon\` (optional): \`"lucide:<name>"\` for a [Lucide](https://lucide.dev/icons) icon, or one emoji.
- \`rule\`: a [query](/docs/query-language), or \`""\` for none. \`about:"…"\` asks Jev. The rule looks only at the PR or issue.
- \`description\`: up to ${MAX_DESCRIPTION_CHARS} characters, or \`""\`. With a description, Jev can choose this category.

An item gets one category from each group, in this order: a category you chose for it; the first category whose rule matches, top to bottom; Jev's choice among the categories with a description. When no rule matches and Jev is off or cannot answer, the item is **Not sorted** in that group: it has no category from the group.

Jev reads each item once, and again when its title, description, or labels change, or when you change the descriptions of a group. **Re-evaluate items** asks again about every category for your open items.

A change to \`categoryGroups\` replaces the whole list. See [Categories](/docs/categories).

\`\`\`json settings
{
  "categoryGroups": [
    {
      "id": "area",
      "name": "Area",
      "categories": [
        { "id": "website", "name": "Website", "color": "blue", "rule": "repo:acme/website", "description": "" },
        { "id": "api", "name": "API", "color": "violet", "rule": "", "description": "Changes to the public API" }
      ]
    },
    {
      "id": "risk",
      "name": "Risk",
      "categories": [
        { "id": "security", "name": "Security", "color": "red", "icon": "lucide:shield", "rule": "label:security", "description": "Vulnerabilities, secrets, permissions, or authentication" }
      ]
    }
  ]
}
\`\`\`

The defaults:

${table(
	['group', 'id', 'name', 'description'],
	DEFAULT_CATEGORY_GROUPS.flatMap((g) =>
		g.categories.map((c) => [g.name, code(c.id), c.name, c.description])
	)
)}`
	},
	'dash.excludedTeams': {
		type: 'array of strings',
		body: `Teams that \`@team\` searches skip, as \`"org/team"\` slugs. Hush finds your teams on GitHub (again every ${TEAMS_TTL / HOUR} hours); turn off big ones, such as “everyone”, to cut noise. A search runs for the first 15 teams at most, and all views together run up to ${MAX_QUERIES} searches for each type.

\`\`\`json settings
{ "dash": { "excludedTeams": ["acme/everyone", "acme/contractors"] } }
\`\`\``
	},
	'dash.staleDays': {
		type: 'whole number, 1 to 60',
		body: `An item whose turn started more than this many days ago is **stale**: it shows how long it waited (“waiting 5d”) in amber. Items that wait on nobody are never stale.`
	},
	'dash.hideOthersDrafts': {
		type: 'boolean',
		body: `Leave out draft PRs that someone else opened. Your own drafts always show (in Other).`
	},
	'dash.hideBots': {
		type: 'boolean',
		body: `Leave out PRs and issues that bots opened, unless your review is requested from you by name.`
	},
	'menus.dash': {
		type: 'array of menu item ids',
		body: `The items of the right-click menu (and the “⋯” menu on phones) of pull requests and issues, in order. \`"${SEP}"\` is a separator line. Items that you leave out are hidden. Items that do not apply to an item, such as “Open on GitHub” when it is the main action, are left out when the menu opens. See the item ids in [Menus](/docs/appearance-and-menus#menu-items).

\`\`\`json settings
{ "menus": { "dash": ["peek", "main", "sep", "snooze", "mute", "read", "sep", "copy"] } }
\`\`\`

Hush adds \`"v"\` (the menu version) next to your menus. Leave it: it tells Hush which new items you have already seen.`
	},
	'swipe.dash': {
		type: '{ "left": action, "right": action }',
		body: `On a phone or tablet, swipe a pull request or issue to the right or to the left to act on it: the row moves with your finger, shows the action, and acts when you let go past the line. A mouse or pen never swipes. The actions: ${SWIPE_ACTIONS.dash.map((a) => `\`"${a.id}"\` (${a.label})`).join(', ')}.

\`\`\`json settings
{ "swipe": { "dash": { "right": "snooze", "left": "read" } } }
\`\`\``
	},
	'rows.pr': {
		type: 'array of part ids',
		body: `The parts that pull request rows do not show. **Settings → General → Row contents** sets it with a preview. The title, the repository and number, the turn, and the main action always show. Parts: ${ROW_PARTS.pr.map((p) => `\`"${p.id}"\` (${p.label})`).join(', ')}. The default hides ${DEFAULT_ROWS.pr.map((id) => `\`"${id}"\``).join(', ')}.

\`\`\`json settings
{ "rows": { "pr": ["threads", "labels", "comments"] } }
\`\`\``
	},
	'rows.issue': {
		type: 'array of part ids',
		body: `The same for issue rows. Parts: ${ROW_PARTS.issue.map((p) => `\`"${p.id}"\` (${p.label})`).join(', ')}.`
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
{ "keys": { "dash.snooze": ["d", "e"], "dash.mute": [], "palette": ["Mod+k", "Mod+p"] } }
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

/** Some commands and their keys, in this order: {{ref:keys list.next dash.snooze}}. */
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
	const worksIn = (w: QueryWord) => {
		const checker = w.runs === 'hush' ? 'Hush' : 'GitHub';
		const places = [
			wordWorksIn(w, 'search') && `views (${checker})`,
			wordWorksIn(w, 'rule') && 'rules',
			wordWorksIn(w, 'section') && 'sections'
		].filter(Boolean);
		const text = places.join(', ');
		return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
	};
	const words = table(
		['Word', 'Filters on', 'Works in'],
		[
			...WORDS.map((w) => [code(`${w.key}:`), `${w.help}: ${code(w.example)}`, worksIn(w)]),
			[
				code('is:'),
				`Pull request, issue, draft, open, closed, or merged: ${code('is:draft')}`,
				'Views (GitHub), rules, sections'
			],
			[
				'other words',
				"In a view's search, GitHub's text search. In a rule or a section, words that must all be in the title, repository, or author",
				'Views (GitHub), rules, sections'
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
	return `${words}\n\n## Values\n\n${values}\n\n### is:\n\n${is}`;
}

function menusReference(): string {
	return (['dash'] as MenuKind[])
		.map((kind) => {
			const rows = MENU_ITEMS[kind].map((i) => [
				code(i.id),
				i.label,
				i.note ?? '',
				DEFAULT_MENUS[kind].includes(i.id) ? 'yes' : 'no'
			]);
			const title = 'PRs and issues (menus.dash)';
			return `### ${title}\n\n${table(['Id', 'Item', 'Shows', 'In the default menu'], rows)}\n\nThe default order: ${code(json(DEFAULT_MENUS[kind]))}`;
		})
		.join('\n\n');
}

function snoozeReference(): string {
	return table(
		['Snooze until', 'For'],
		SNOOZE_EVENTS.map((e) => [
			e.label,
			e.kinds.includes('issue') ? 'Pull requests and issues' : 'Pull requests'
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
			[
				'The searches of your views',
				`run every ${dur(DASH_TTL)} while Hush polls; refresh any time`
			],
			[
				'Searches run again for a notification about an untracked PR or issue',
				`at most every ${dur(TRACKED_REBUILD_GAP)}`
			],
			['An item that no view finds any more stays tracked for', dur(TRACKED_KEEP)],
			['Your teams', `looked up again every ${dur(TEAMS_TTL)}`],
			[
				'Polling stops with no visit for',
				`${dur(PAUSE_AFTER_NO_PUSH)} (${dur(PAUSE_AFTER_WITH_PUSH)} with push devices); opening Hush starts it again`
			],
			['A snooze “until something happens” also ends after', dur(SNOOZE_EVENT_MAX_MS)],
			['Pushes per poll before they become one push (“5 alerts”)', String(MAX_INDIVIDUAL_PUSHES)],
			['Alert history (the bell)', dur(ALERT_LOG_KEEP)],
			['Views', String(MAX_VIEWS)],
			['Searches in a view', String(MAX_VIEW_SEARCHES)],
			['GitHub searches for pull requests, and for issues', String(MAX_QUERIES)],
			['Items per menu', '60'],
			['Keys per command', '4'],
			['Push devices', '10'],
			['Category groups', String(MAX_CATEGORY_GROUPS)],
			['Categories in a group', String(MAX_CATEGORIES)],
			['Different about: conditions in categories', String(MAX_SMART_CONDITIONS)],
			['Length of one about: condition', `${MAX_CONDITION_CHARS} characters`],
			[
				'Smart decisions per account',
				`${DEFAULT_DAILY_TOKENS.toLocaleString('en-US')} tokens a day`
			],
			[
				'Items checked again when you turn on smart decisions or add an about: condition',
				String(FILL_MAX)
			],
			[
				'Session',
				`${SESSION_IDLE_DAYS} days with no use, or ${SESSION_DAYS} days after sign-in; then sign in again`
			]
		]
	);
}

function viewsReference() {
	return table(
		['Default view', 'Searches'],
		DEFAULT_VIEWS.map((v) => [v.name, v.searches.map(code).join(', ')])
	);
}

export const REFERENCES: Record<string, (args: string[]) => string> = {
	views: viewsReference,
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
