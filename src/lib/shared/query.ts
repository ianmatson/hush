import { tokens } from './text-match';
import type { RuleMatch } from './types';

/**
 * One small query language for rules, saved views, and the Filter box. Rules and views store the
 * text; it compiles to RuleMatch, the form the matcher reads (and back, for the visual editor):
 *
 *   repo:acme/* needs:review -author:bots label:"good first issue" login bug
 *
 * - `word:value` is a condition; `word:a,b` (or the word twice) matches any of the values.
 * - `author:bots` and `from:bots` mean any bot; `-author:bots` and `-from:bots` mean a person.
 * - `is:draft` (or `-is:draft`), and `is:open`, `is:closed`, `is:merged`.
 * - Other words must all be in the title, repo, or author (`text`).
 * - Quote a value that has spaces or commas.
 *
 * WORDS is the whole vocabulary: the parser, the formatter, the errors, and the suggestions
 * while you type all read it.
 */

type Field = keyof RuleMatch;

export interface QueryWord {
	key: string;
	field: Field;
	/** What the word filters on, for the suggestions. */
	help: string;
	example: string;
	/** Fixed values: the word you type → the stored value, with its description. */
	values?: Record<string, { stored: string; help: string }>;
	/** "bots" is a value too: it sets this yes/no field (author:bots, from:bots). */
	bots?: 'bot' | 'byBot';
}

const v = (stored: string, help: string) => ({ stored, help });

export const WORDS: QueryWord[] = [
	{ key: 'repo', field: 'repo', help: 'Repository (* matches anything)', example: 'repo:acme/*' },
	{
		key: 'author',
		field: 'author',
		help: 'Who opened it; author:bots for any bot',
		example: 'author:dependabot*',
		bots: 'bot'
	},
	{
		key: 'from',
		field: 'by',
		help: 'Who did the latest activity (a comment or a review); from:bots for any bot',
		example: 'from:github-actions',
		bots: 'byBot'
	},
	{ key: 'label', field: 'label', help: 'Has this label', example: 'label:"good first issue"' },
	{
		key: 'type',
		field: 'type',
		help: 'What it is',
		example: 'type:pr',
		values: {
			pr: v('PullRequest', 'Pull request'),
			issue: v('Issue', 'Issue'),
			ci: v('CheckSuite', 'Workflow run'),
			release: v('Release', 'Release'),
			discussion: v('Discussion', 'Discussion'),
			commit: v('Commit', 'Commit'),
			vulnerability: v('RepositoryVulnerabilityAlert', 'Vulnerability alert'),
			dependabot: v('RepositoryDependabotAlertsThread', 'Dependabot alerts')
		}
	},
	{
		key: 'event',
		field: 'reason',
		help: 'Why GitHub notified you',
		example: 'event:you-opened',
		values: {
			'review-requested': v('review_requested', 'Your review was requested'),
			mentioned: v('mention', 'You were mentioned'),
			'team-mentioned': v('team_mention', 'Your team was mentioned'),
			'you-opened': v('author', 'You opened it'),
			'you-commented': v('comment', 'You commented on it'),
			assigned: v('assign', 'You were assigned'),
			watching: v('subscribed', 'You watch the repository'),
			subscribed: v('manual', 'You subscribed to it'),
			'state-changed': v('state_change', 'You changed its state'),
			'your-ci': v('ci_activity', 'Your workflow run'),
			security: v('security_alert', 'Security alert'),
			invited: v('invitation', 'Repository invitation'),
			'deploy-approval': v('approval_requested', 'A deployment waits for your approval'),
			'feature-request': v('member_feature_requested', 'Feature request'),
			'advisory-credit': v('security_advisory_credit', 'Security advisory credit')
		}
	},
	{
		key: 'needs',
		field: 'kind',
		help: 'What Hush thinks you must do',
		example: 'needs:review',
		values: {
			review: v('review', 'Review it'),
			'fix-ci': v('fix_ci', 'Fix failing CI'),
			changes: v('address_review', 'Address review comments'),
			conflict: v('resolve_conflict', 'Resolve a merge conflict'),
			merge: v('merge', 'Merge it'),
			reply: v('reply', 'Reply'),
			triage: v('triage', 'Triage it'),
			security: v('security', 'Handle a security alert'),
			nothing: v('none', 'Nothing: FYI')
		}
	},
	{
		key: 'in',
		field: 'category',
		help: "Hush's list for it, before your rules",
		example: 'in:fyi',
		values: {
			'needs-you': v('action', 'Needs you'),
			fyi: v('fyi', 'FYI'),
			muted: v('muted', 'Muted')
		}
	}
];

/** `is:` (not a field of its own): draft, and the state of a PR or issue. */
export const IS_VALUES: Record<string, string> = {
	draft: 'A draft pull request',
	open: 'Open',
	closed: 'Closed',
	merged: 'Merged'
};

/** Words that were renamed: a clear error, not a silent miss. */
const RENAMED: Record<string, string> = {
	kind: 'needs',
	reason: 'event',
	category: 'in',
	why: 'event',
	by: 'from'
};

export const QUERY_KEYS = [...WORDS.map((w) => w.key), 'is'];
const WORD = new Map(WORDS.map((w) => [w.key, w]));

/** Split `a,b` values; a quoted part keeps its commas. */
function values(raw: string): string[] {
	const out: string[] = [];
	for (const m of raw.matchAll(/(?:[^,"]+|"[^"]*"?)+/g)) out.push(m[0].replace(/"/g, '').trim());
	return out.filter(Boolean);
}

export interface ParsedQuery {
	when: RuleMatch;
	/** One message per part that Hush does not understand; those parts are left out of `when`. */
	errors: string[];
}

export function parseQuery(query: string): ParsedQuery {
	const when: RuleMatch = {};
	const errors: string[] = [];
	const words: string[] = [];
	const lists = new Map<Field, string[]>();
	const states: ('open' | 'closed' | 'merged')[] = [];
	const add = (field: Field, value: string) => {
		const list = lists.get(field) ?? [];
		if (!list.includes(value)) list.push(value);
		lists.set(field, list);
	};
	// Split before removing quotes, so `label:"a b"` stays one part.
	for (const part of query.match(/(?:[^\s"]+|"[^"]*"?)+/g) ?? []) {
		const m = /^(-?)([a-z]+):(.*)$/i.exec(part);
		if (!m) {
			words.push(...tokens(part));
			continue;
		}
		const [, not, rawKey, raw] = m;
		const key = rawKey.toLowerCase();
		const vals = values(raw);
		if (RENAMED[key]) {
			errors.push(`Use ${RENAMED[key]}: instead of ${key}:.`);
			continue;
		}
		if (!vals.length) {
			errors.push(`“${part}” needs a value.`);
			continue;
		}
		if (key === 'is') {
			for (const x of vals.map((y) => y.toLowerCase())) {
				if (x === 'bot') errors.push(`Use author:bots instead of is:bot.`);
				else if (!(x in IS_VALUES))
					errors.push(`Unknown “is:${x}”. Use ${Object.keys(IS_VALUES).join(', ')}.`);
				else if (x === 'draft') when.draft = !not;
				else if (not) errors.push(`“-is:${x}” is not supported. Use is:open, closed, or merged.`);
				else if (!states.includes(x as 'open')) states.push(x as 'open');
			}
			continue;
		}
		const w = WORD.get(key);
		if (!w) {
			errors.push(`Unknown “${rawKey}:”. Use ${QUERY_KEYS.join(', ')}.`);
			continue;
		}
		for (const x of vals) {
			if (w.bots && x.toLowerCase() === 'bots') {
				when[w.bots] = !not;
				continue;
			}
			if (not) {
				errors.push(
					w.bots
						? `“-${key}:${x}” is not supported. Only -${key}:bots.`
						: `“-${key}:” is not supported.`
				);
				continue;
			}
			if (!w.values) {
				add(w.field, x);
				continue;
			}
			const hit = Object.entries(w.values).find(([word]) => word === x.toLowerCase());
			if (hit) add(w.field, hit[1].stored);
			else errors.push(`Unknown “${key}:${x}”. Use ${Object.keys(w.values).join(', ')}.`);
		}
	}
	for (const w of WORDS) {
		const list = lists.get(w.field);
		if (!list?.length) continue;
		// Repo, author, and from: one glob is stored as a string (the form people write by hand).
		const one = w.field === 'repo' || w.field === 'author' || w.field === 'by';
		(when as Record<string, unknown>)[w.field] = one && list.length === 1 ? list[0] : list;
	}
	if (states.length) when.state = states;
	if (words.length) when.text = words.join(' ');
	return { when, errors };
}

const quote = (x: string) => (/[\s,":]/.test(x) ? `"${x.replace(/"/g, '')}"` : x);
const asList = (x: unknown): string[] =>
	x === undefined ? [] : Array.isArray(x) ? x.map(String) : [String(x)];

/** Write conditions as a query, in the order of WORDS (then is:, then the free words). */
/** The longest query that a rule or a view can store. */
export const MAX_QUERY = 300;

const compiled = new Map<string, RuleMatch>();
/**
 * A stored query as conditions, cached (rules are matched against every thread). A part with an
 * error is left out; validation refuses such a query before it is saved.
 */
export function compileQuery(query: string): RuleMatch {
	let when = compiled.get(query);
	if (!when) {
		when = parseQuery(query).when;
		if (compiled.size > 500) compiled.clear();
		compiled.set(query, when);
	}
	return when;
}

/** Why a stored query cannot be saved, or null. */
export function queryError(query: unknown): string | null {
	if (typeof query !== 'string') return 'must be a query (text), such as "repo:acme/*".';
	if (query.length > MAX_QUERY) return `the query must be ${MAX_QUERY} characters or fewer.`;
	return parseQuery(query).errors[0] ?? null;
}

export function formatQuery(when: RuleMatch): string {
	const parts: string[] = [];
	for (const w of WORDS) {
		const list = asList(when[w.field]).map((x) => {
			const word = w.values && Object.entries(w.values).find(([, val]) => val.stored === x)?.[0];
			return quote(word ?? x);
		});
		if (list.length) parts.push(`${w.key}:${list.join(',')}`);
		if (w.bots && when[w.bots] !== undefined) parts.push(`${when[w.bots] ? '' : '-'}${w.key}:bots`);
	}
	if (when.draft !== undefined) parts.push(`${when.draft ? '' : '-'}is:draft`);
	for (const s of when.state ?? []) parts.push(`is:${s}`);
	// Free words last, as people type them.
	if (when.text) parts.push(...tokens(when.text).map(quote));
	return parts.join(' ');
}

export interface Suggestion {
	/** What the suggestion puts in place of the text from `from` to `to`. */
	insert: string;
	label: string;
	help?: string;
}

/**
 * Suggestions for the word at the caret: the words themselves ("ne" → needs:), or the values of
 * a word ("needs:" → review, fix-ci…). `from`/`to` is the text a pick replaces.
 */
export function suggest(
	query: string,
	caret: number
): { from: number; to: number; items: Suggestion[] } {
	let start = caret;
	while (start > 0 && !/\s/.test(query[start - 1])) start--;
	let end = caret;
	while (end < query.length && !/\s/.test(query[end])) end++;
	const token = query.slice(start, caret);
	const none = { from: caret, to: caret, items: [] as Suggestion[] };
	const colon = token.indexOf(':');
	if (colon < 0) {
		const neg = token.startsWith('-') ? 1 : 0;
		const prefix = token.slice(neg).toLowerCase();
		if (/["]/.test(prefix)) return none;
		const keys = [
			...WORDS.map((w) => ({ key: w.key, help: w.help, example: w.example })),
			{ key: 'is', help: 'Draft, open, closed, or merged', example: 'is:draft' }
		].filter((w) => w.key.startsWith(prefix) && w.key !== prefix);
		return {
			from: start + neg,
			to: end,
			items: keys.map((w) => ({
				insert: `${w.key}:`,
				label: `${w.key}:`,
				help: `${w.help} · ${w.example}`
			}))
		};
	}
	const key = token.slice(token.startsWith('-') ? 1 : 0, colon).toLowerCase();
	const valueStart = start + Math.max(colon, token.lastIndexOf(',')) + 1;
	const prefix = query.slice(valueStart, caret).toLowerCase().replace(/"/g, '');
	const w = WORD.get(key);
	const options: Suggestion[] =
		key === 'is'
			? Object.entries(IS_VALUES).map(([x, help]) => ({ insert: x, label: x, help }))
			: w?.values
				? Object.entries(w.values).map(([x, val]) => ({ insert: x, label: x, help: val.help }))
				: w?.bots
					? [{ insert: 'bots', label: 'bots', help: 'Any bot' }]
					: [];
	const items = options
		.filter((o) => o.label.startsWith(prefix) && o.label !== prefix)
		.map((o) => ({ ...o, insert: `${o.insert} ` }));
	return { from: valueStart, to: end, items };
}
