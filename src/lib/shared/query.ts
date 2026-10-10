import { tokens } from './text-match';
import { readsBoard } from './projects';
import type { RuleMatch } from './types';

type Field = keyof RuleMatch;

export const MAX_CONDITION_CHARS = 200;
export const ME = '@me';
const NUMBER_PATTERN = /^(?:(?:<|>|<=|>=)?\d+|\d+\.\.\d+)$/;
const DATE = String.raw`(?:\d{4}-\d{2}-\d{2}|@today(?:-\d{1,4}[dw])?)`;
const DATE_PATTERN = new RegExp(
	String.raw`^(?:(?:<|>|<=|>=)?${DATE}|(?:${DATE}|\*)\.\.(?:${DATE}|\*))$`
);
const DAY_MS = 86_400_000;

export type WordRuns = 'both' | 'github' | 'hush';
export type QueryPlace = 'rule' | 'section' | 'search';

export interface QueryWord {
	key: string;
	field?: Field;
	runs: WordRuns;
	format?: 'number' | 'date';
	/** What the word filters on, for the suggestions. */
	help: string;
	example: string;
	/** Fixed values: the word you type → the stored value, with its description. */
	values?: Record<string, { stored: string; help: string }>;
	/** "bots" is a value too: it sets this yes/no field (author:bots, from:bots). */
	bots?: 'bot' | 'byBot';
}

const v = (stored: string, help: string) => ({ stored, help });

const github = (key: string, help: string, example: string, format?: 'date'): QueryWord => ({
	key,
	runs: 'github',
	help,
	example,
	format
});

export const WORDS: QueryWord[] = [
	{
		key: 'repo',
		field: 'repo',
		runs: 'both',
		help: 'Repository; * matches anything',
		example: 'repo:acme/web'
	},
	{
		key: 'org',
		field: 'org',
		runs: 'both',
		help: 'Owner of the repository: an org or a person',
		example: 'org:acme'
	},
	{
		key: 'author',
		field: 'author',
		runs: 'both',
		help: 'Who opened it; author:bots for any bot',
		example: 'author:dependabot*',
		bots: 'bot'
	},
	{
		key: 'assignee',
		field: 'assignee',
		runs: 'both',
		help: 'Who it is assigned to; @me for you',
		example: 'assignee:@me'
	},
	{
		key: 'label',
		field: 'label',
		runs: 'both',
		help: 'Has this label',
		example: 'label:"good first issue"'
	},
	{
		key: 'review-requested',
		field: 'reviewRequested',
		runs: 'both',
		help: 'Whose review is requested: @me, a login, or org/team',
		example: 'review-requested:@me'
	},
	{
		key: 'type',
		field: 'type',
		runs: 'both',
		help: 'What it is',
		example: 'type:pr',
		values: {
			pr: v('PullRequest', 'Pull request'),
			issue: v('Issue', 'Issue')
		}
	},
	{
		key: 'draft',
		field: 'draft',
		runs: 'both',
		help: 'A draft pull request, or not',
		example: 'draft:false',
		values: { true: v('true', 'Draft'), false: v('false', 'Not a draft') }
	},
	{
		key: 'review',
		field: 'review',
		runs: 'both',
		help: 'Review state of a pull request',
		example: 'review:approved',
		values: {
			none: v('none', 'No review yet'),
			required: v('required', 'Review required'),
			approved: v('approved', 'Approved'),
			changes_requested: v('changes_requested', 'Changes requested')
		}
	},
	{
		key: 'status',
		field: 'ci',
		runs: 'both',
		help: 'CI of a pull request',
		example: 'status:failure',
		values: {
			success: v('success', 'CI passed'),
			failure: v('failure', 'CI failed'),
			pending: v('pending', 'CI running')
		}
	},
	{
		key: 'comments',
		field: 'comments',
		runs: 'both',
		format: 'number',
		help: 'Number of comments: >10, 0, 5..20',
		example: 'comments:>10'
	},
	{
		key: 'created',
		field: 'created',
		runs: 'both',
		format: 'date',
		help: 'When it was opened: >2026-01-01, <@today-30d',
		example: 'created:>@today-7d'
	},
	{
		key: 'updated',
		field: 'updated',
		runs: 'both',
		format: 'date',
		help: 'When it last changed: <@today-14d, 2026-01-01..2026-02-01',
		example: 'updated:<@today-14d'
	},
	{
		key: 'no',
		field: 'no',
		runs: 'both',
		help: 'Has no labels, or no assignee',
		example: 'no:assignee',
		values: { label: v('label', 'No labels'), assignee: v('assignee', 'No assignee') }
	},
	{
		key: 'from',
		field: 'by',
		runs: 'hush',
		help: 'Who did the latest activity (a comment or a review); from:bots for any bot',
		example: 'from:github-actions',
		bots: 'byBot'
	},
	{
		key: 'size',
		field: 'size',
		runs: 'hush',
		format: 'number',
		help: 'Lines changed in a pull request: <50, >500, 10..200',
		example: 'size:<50'
	},
	{
		key: 'category',
		field: 'category',
		runs: 'hush',
		help: 'Has this category (its name or id)',
		example: 'category:low'
	},
	{
		key: 'about',
		field: 'about',
		runs: 'hush',
		help: 'What it is about, in your own words (smart decisions)',
		example: 'about:"database migrations"'
	},
	github('mentions', 'Mentions this person', 'mentions:@me'),
	github('commenter', 'Has a comment by this person', 'commenter:octocat'),
	github('involves', 'Author, assignee, commenter, or mentioned', 'involves:@me'),
	github('reviewed-by', 'Reviewed by this person', 'reviewed-by:@me'),
	github('user-review-requested', 'Review requested from this person', 'user-review-requested:@me'),
	github(
		'team-review-requested',
		'Review requested from this team; @team for each of your teams',
		'team-review-requested:@team'
	),
	github('team', 'Mentions this team', 'team:acme/web'),
	github('base', 'Base branch of a pull request', 'base:main'),
	github('head', 'Head branch of a pull request', 'head:fix-login'),
	github('milestone', 'In this milestone', 'milestone:"v2.0"'),
	github('project', 'In this project; with status:, reads the board', 'project:acme/5'),
	github('archived', 'In an archived repository, or not', 'archived:false'),
	github('in', 'Where the free words must be', 'in:title'),
	github('linked', 'Linked to a pull request or an issue', 'linked:pr'),
	github('closed', 'When it was closed', 'closed:>@today-7d', 'date'),
	github('merged', 'When it was merged', 'merged:>@today-7d', 'date'),
	github('sort', 'Which 100 results GitHub sends first', 'sort:created-desc')
];

/** `is:` (not a field of its own): draft, and the state of a PR or issue. */
export const IS_VALUES: Record<string, string> = {
	pr: 'A pull request',
	issue: 'An issue',
	draft: 'A draft pull request',
	open: 'Open',
	closed: 'Closed',
	merged: 'Merged'
};

/** Words that were renamed: a clear error, not a silent miss. */
const RENAMED: Record<string, string> = {
	by: 'from'
};

export const QUERY_KEYS = [...WORDS.map((w) => w.key), 'is'];
export const WORD = new Map(WORDS.map((w) => [w.key, w]));
const IS_TYPES = { pr: 'PullRequest', issue: 'Issue' } as const;
const ONE_GLOB_FIELDS = new Set<Field>(['repo', 'org', 'author', 'by', 'assignee']);

export const wordWorksIn = (w: Pick<QueryWord, 'key' | 'runs'>, place: QueryPlace) =>
	place === 'search'
		? w.key !== 'about'
		: w.runs !== 'github' &&
			!(place === 'rule' && w.key === 'category') &&
			!(place === 'section' && w.key === 'about');

export const wordsFor = (place: QueryPlace) => WORDS.filter((w) => wordWorksIn(w, place));

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
		const m = /^(-?)([a-z][a-z-]*):(.*)$/i.exec(part);
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
				else if (not) errors.push(`“-is:${x}” is not supported here.`);
				else if (x === 'pr' || x === 'issue') add('type', IS_TYPES[x]);
				else if (!states.includes(x as 'open')) states.push(x as 'open');
			}
			continue;
		}
		const w = WORD.get(key);
		if (!w) {
			errors.push(`Unknown “${rawKey}:”. Use ${QUERY_KEYS.join(', ')}.`);
			continue;
		}
		if (!w.field) {
			errors.push(`“${key}:” works only in a view's search.`);
			continue;
		}
		const field = w.field;
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
			if (w.format === 'number' && !NUMBER_PATTERN.test(x)) {
				errors.push(`“${key}:${x}” must look like <50, >500, <=10, >=10, or 10..200.`);
				continue;
			}
			if (w.format === 'date' && !DATE_PATTERN.test(x)) {
				errors.push(
					`“${key}:${x}” must be a date such as >2026-01-01, <@today-7d, or 2026-01-01..2026-02-01.`
				);
				continue;
			}
			if (field === 'about' && x.length > MAX_CONDITION_CHARS) {
				errors.push(`An about: condition must be ${MAX_CONDITION_CHARS} characters or fewer.`);
				continue;
			}
			if (!w.values) {
				add(field, x);
				continue;
			}
			const hit = Object.entries(w.values).find(([word]) => word === x.toLowerCase());
			if (!hit) errors.push(`Unknown “${key}:${x}”. Use ${Object.keys(w.values).join(', ')}.`);
			else if (field === 'draft') when.draft = hit[1].stored === 'true';
			else add(field, hit[1].stored);
		}
	}
	for (const w of WORDS) {
		const list = w.field && lists.get(w.field);
		if (!w.field || !list?.length) continue;
		// Repo, author, and from: one glob is stored as a string (the form people write by hand).
		const one = ONE_GLOB_FIELDS.has(w.field);
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

const NO_CATEGORY_IN_RULES = 'Category rules cannot use category:.';
const NO_ABOUT_IN_SECTIONS =
	'Sections cannot use about:. Make a category whose rule uses about:, then use category:.';
const NO_ABOUT_IN_SEARCHES =
	"A view's search cannot use about:. Make a category whose rule uses about:, then use category:.";
const NO_OR_IN_SEARCHES =
	"A view's search cannot use OR or parentheses. Add a search for each choice.";
const HUSH_VALUE = /[*?]/;

/** Why a stored query cannot be saved, or null. */
export function queryError(query: unknown, place: QueryPlace = 'rule'): string | null {
	if (typeof query !== 'string') return 'must be a query (text), such as "repo:acme/*".';
	if (query.length > MAX_QUERY) return `the query must be ${MAX_QUERY} characters or fewer.`;
	if (place === 'search') return splitSearch(query).errors[0] ?? null;
	const { expr, errors } = parseExpr(query);
	if (errors.length) return errors[0];
	const leaves = leavesOf(expr);
	if (place === 'rule' && leaves.some((w) => w.category?.length)) return NO_CATEGORY_IN_RULES;
	if (place === 'section' && leaves.some((w) => w.about?.length)) return NO_ABOUT_IN_SECTIONS;
	return null;
}

export interface SplitSearch {
	github: string;
	hush: string;
	errors: string[];
}

const runsInHush = (w: QueryWord, value: string) =>
	w.runs === 'hush' ||
	(w.runs === 'both' && ((!!w.bots && value.toLowerCase() === 'bots') || HUSH_VALUE.test(value)));

export function splitSearch(search: string): SplitSearch {
	if (readsBoard(search)) return { github: search.trim(), hush: '', errors: [] };
	const github: string[] = [];
	const hush: string[] = [];
	const errors: string[] = [];
	for (const t of tokenize(search)) {
		if (t.type !== 'term') {
			errors.push(NO_OR_IN_SEARCHES);
			continue;
		}
		const m = /^-?([a-z][a-z-]*):(.*)$/i.exec(t.text);
		const w = m ? WORD.get(m[1].toLowerCase()) : undefined;
		if (!m || !w) {
			github.push(t.text);
			continue;
		}
		if (w.field === 'about') {
			errors.push(NO_ABOUT_IN_SEARCHES);
			continue;
		}
		const vals = values(m[2]);
		if (vals.some((x) => runsInHush(w, x))) {
			hush.push(t.text);
			continue;
		}
		if (w.runs === 'both' && vals.length > 1 && w.key !== 'label')
			errors.push(`In a view's search, give ${w.key}: one value. Add a search for each value.`);
		github.push(t.text);
	}
	const hushText = hush.join(' ');
	if (hushText) errors.push(...parseExpr(hushText).errors);
	return { github: github.join(' '), hush: hushText, errors: [...new Set(errors)] };
}

const TODAY = /@today(?:-(\d{1,4})([dw]))?/g;

function dayStart(date: string, now: number): number | null {
	const relative = /^@today(?:-(\d+)([dw]))?$/.exec(date);
	if (relative) {
		const back = relative[1] ? Number(relative[1]) * (relative[2] === 'w' ? 7 : 1) : 0;
		return Math.floor(now / DAY_MS) * DAY_MS - back * DAY_MS;
	}
	const t = Date.parse(`${date}T00:00:00Z`);
	return Number.isNaN(t) ? null : t;
}

export const resolveToday = (text: string, now: number) =>
	text.replace(TODAY, (date) => new Date(dayStart(date, now)!).toISOString().slice(0, 10));

export function dateMatches(spec: string, iso: string | null | undefined, now: number): boolean {
	const t = iso ? Date.parse(iso) : NaN;
	if (Number.isNaN(t)) return false;
	const range = /^(.+)\.\.(.+)$/.exec(spec);
	if (range) {
		const from = range[1] === '*' ? null : dayStart(range[1], now);
		const to = range[2] === '*' ? null : dayStart(range[2], now);
		return (from === null || t >= from) && (to === null || t < to + DAY_MS);
	}
	const m = /^(<=|>=|<|>)?(.+)$/.exec(spec);
	const day = m ? dayStart(m[2], now) : null;
	if (!m || day === null) return false;
	switch (m[1]) {
		case '<':
			return t < day;
		case '<=':
			return t < day + DAY_MS;
		case '>':
			return t >= day + DAY_MS;
		case '>=':
			return t >= day;
		default:
			return t >= day && t < day + DAY_MS;
	}
}

export type QueryExpr =
	| { kind: 'match'; when: RuleMatch }
	| { kind: 'and'; parts: QueryExpr[] }
	| { kind: 'or'; parts: QueryExpr[] }
	| { kind: 'not'; part: QueryExpr };

type Token =
	| { type: 'open' }
	| { type: 'close' }
	| { type: 'or' }
	| { type: 'not' }
	| { type: 'term'; text: string };

const OR_WORD = 'OR';
const EVERYTHING: QueryExpr = { kind: 'match', when: {} };

export function tokenize(query: string): Token[] {
	const out: Token[] = [];
	let i = 0;
	while (i < query.length) {
		const ch = query[i];
		if (/\s/.test(ch)) i++;
		else if (ch === '(') (out.push({ type: 'open' }), i++);
		else if (ch === ')') (out.push({ type: 'close' }), i++);
		else if (ch === '-' && query[i + 1] === '(') (out.push({ type: 'not' }), i++);
		else {
			let j = i;
			let quoted = false;
			while (j < query.length && (quoted || !/[\s()]/.test(query[j]))) {
				if (query[j] === '"') quoted = !quoted;
				j++;
			}
			const text = query.slice(i, j);
			out.push(text === OR_WORD ? { type: 'or' } : { type: 'term', text });
			i = j;
		}
	}
	return out;
}

const keepsItsOwnMinus = (term: string) => term.includes(':') && !parseQuery(term).errors.length;

export interface ParsedExpr {
	expr: QueryExpr;
	errors: string[];
}

export function parseExpr(query: string): ParsedExpr {
	const tokens = tokenize(query);
	const errors: string[] = [];
	let pos = 0;
	const leaf = (text: string): QueryExpr => {
		const parsed = parseQuery(text);
		errors.push(...parsed.errors);
		return { kind: 'match', when: parsed.when };
	};
	const group = (): QueryExpr => {
		const inner = parseOr();
		if (tokens[pos]?.type === 'close') pos++;
		else errors.push('A “(” has no matching “)”.');
		return inner;
	};
	const parseAnd = (): QueryExpr => {
		const parts: QueryExpr[] = [];
		let plain: string[] = [];
		const flush = () => {
			if (plain.length) parts.push(leaf(plain.join(' ')));
			plain = [];
		};
		while (pos < tokens.length) {
			const t = tokens[pos];
			if (t.type === 'or' || t.type === 'close') break;
			pos++;
			if (t.type === 'open') {
				flush();
				parts.push(group());
			} else if (t.type === 'not') {
				flush();
				pos++;
				parts.push({ kind: 'not', part: group() });
			} else if (t.text.startsWith('-') && t.text.length > 1 && !keepsItsOwnMinus(t.text)) {
				flush();
				parts.push({ kind: 'not', part: leaf(t.text.slice(1)) });
			} else plain.push(t.text);
		}
		flush();
		if (!parts.length) return EVERYTHING;
		return parts.length === 1 ? parts[0] : { kind: 'and', parts };
	};
	const parseOr = (): QueryExpr => {
		const parts = [parseAnd()];
		while (tokens[pos]?.type === 'or') {
			pos++;
			parts.push(parseAnd());
		}
		if (parts.length > 1 && parts.some((p) => p === EVERYTHING))
			errors.push('“OR” needs a condition on both sides.');
		return parts.length === 1 ? parts[0] : { kind: 'or', parts };
	};
	const expr = parseOr();
	if (pos < tokens.length) errors.push('A “)” has no matching “(”.');
	return { expr, errors: [...new Set(errors)] };
}

const compiledExprs = new Map<string, QueryExpr>();

export function compileExpr(query: string): QueryExpr {
	let expr = compiledExprs.get(query);
	if (!expr) {
		expr = parseExpr(query).expr;
		if (compiledExprs.size > 500) compiledExprs.clear();
		compiledExprs.set(query, expr);
	}
	return expr;
}

export function isSimpleQuery(query: string): boolean {
	return compileExpr(query).kind === 'match';
}

export function exprMatches(expr: QueryExpr, matchLeaf: (when: RuleMatch) => boolean): boolean {
	switch (expr.kind) {
		case 'match':
			return matchLeaf(expr.when);
		case 'and':
			return expr.parts.every((p) => exprMatches(p, matchLeaf));
		case 'or':
			return expr.parts.some((p) => exprMatches(p, matchLeaf));
		case 'not':
			return !exprMatches(expr.part, matchLeaf);
	}
}

export function leavesOf(expr: QueryExpr): RuleMatch[] {
	switch (expr.kind) {
		case 'match':
			return [expr.when];
		case 'and':
		case 'or':
			return expr.parts.flatMap(leavesOf);
		case 'not':
			return leavesOf(expr.part);
	}
}

export function numberMatches(spec: string, lines: number): boolean {
	const range = /^(\d+)\.\.(\d+)$/.exec(spec);
	if (range) return lines >= Number(range[1]) && lines <= Number(range[2]);
	const bound = /^(<=|>=|<|>)?(\d+)$/.exec(spec);
	if (!bound) return false;
	const n = Number(bound[2]);
	switch (bound[1]) {
		case '<':
			return lines < n;
		case '>':
			return lines > n;
		case '<=':
			return lines <= n;
		case '>=':
			return lines >= n;
		default:
			return lines === n;
	}
}

export const aboutTexts = (query: string) =>
	leavesOf(compileExpr(query)).flatMap((when) => when.about ?? []);

export function formatQuery(when: RuleMatch): string {
	const parts: string[] = [];
	for (const w of WORDS) {
		if (!w.field || w.field === 'draft') continue;
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
	caret: number,
	place: QueryPlace = 'rule'
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
			...wordsFor(place).map((w) => ({ key: w.key, help: w.help, example: w.example })),
			{
				key: 'is',
				help: 'Pull request, issue, draft, open, closed, or merged',
				example: 'is:draft'
			}
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
