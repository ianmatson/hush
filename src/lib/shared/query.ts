import { RULE_FIELDS, asList, fieldInfo } from './rule-fields';
import { tokens } from './text-match';
import type { RuleMatch } from './types';

/**
 * One small query language for rules, saved views, and the Filter box. It compiles to RuleMatch,
 * the stored form, and back:
 *
 *   repo:PostHog/* kind:review -is:bot label:"good first issue" login bug
 *
 * - `key:value` is a condition; `key:a,b` (or the key twice) matches any of the values.
 * - `is:bot`, `is:draft` and `is:open|closed|merged`; `-is:bot` and `-is:draft` are the opposite.
 * - Other words must all be in the title, repo, or author (`text`).
 * - Quote a value that has spaces or commas.
 */

/** Short names for GitHub subject types. The full names work too. */
const TYPE_ALIASES: Record<string, string> = {
	pr: 'PullRequest',
	issue: 'Issue',
	ci: 'CheckSuite',
	release: 'Release',
	discussion: 'Discussion',
	commit: 'Commit',
	vulnerability: 'RepositoryVulnerabilityAlert',
	dependabot: 'RepositoryDependabotAlertsThread'
};
const TYPE_NAMES = Object.fromEntries(Object.entries(TYPE_ALIASES).map(([k, v]) => [v, k]));

/** The keys that take a list of values. `bot`, `draft`, and `state` are written with `is:`. */
const LIST_KEYS = ['repo', 'author', 'label', 'type', 'reason', 'kind', 'category'] as const;
type ListKey = (typeof LIST_KEYS)[number];
const IS_VALUES = ['bot', 'draft', 'open', 'closed', 'merged'];

export const QUERY_KEYS = [...LIST_KEYS, 'is'];

/** Split `a,b` values; a quoted part keeps its commas. */
function values(raw: string): string[] {
	const out: string[] = [];
	for (const m of raw.matchAll(/(?:[^,"]+|"[^"]*"?)+/g)) out.push(m[0].replace(/"/g, '').trim());
	return out.filter(Boolean);
}

/** The allowed values of an options field, or null when any value is allowed. */
function allowed(key: ListKey): string[] | null {
	const f = fieldInfo(key);
	return f?.input === 'options' ? (f.options ?? []).map((o) => o.value) : null;
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
	const lists: Partial<Record<ListKey, string[]>> = {};
	const states: ('open' | 'closed' | 'merged')[] = [];
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
		if (!vals.length) {
			errors.push(`“${part}” needs a value.`);
			continue;
		}
		if (key === 'is') {
			for (const v of vals.map((x) => x.toLowerCase())) {
				if (!IS_VALUES.includes(v)) errors.push(`Unknown “is:${v}”. Use ${IS_VALUES.join(', ')}.`);
				else if (v === 'bot' || v === 'draft') when[v] = !not;
				else if (not) errors.push(`“-is:${v}” is not supported. Use is:open, closed, or merged.`);
				else if (!states.includes(v as 'open')) states.push(v as 'open');
			}
			continue;
		}
		if (!(LIST_KEYS as readonly string[]).includes(key)) {
			errors.push(`Unknown “${rawKey}:”. Use ${QUERY_KEYS.join(', ')}.`);
			continue;
		}
		if (not) {
			errors.push(`“-${key}:” is not supported. Only -is:bot and -is:draft.`);
			continue;
		}
		const k = key as ListKey;
		const ok = allowed(k);
		for (let v of vals) {
			if (k === 'type') v = TYPE_ALIASES[v.toLowerCase()] ?? v;
			if (ok) {
				const found = ok.find((o) => o.toLowerCase() === v.toLowerCase());
				if (!found) {
					errors.push(`Unknown “${k}:${v}”. Use ${ok.map((o) => TYPE_NAMES[o] ?? o).join(', ')}.`);
					continue;
				}
				v = found;
			}
			const list = (lists[k] ??= []);
			if (!list.includes(v)) list.push(v);
		}
	}
	for (const k of LIST_KEYS) {
		const list = lists[k];
		if (!list?.length) continue;
		// Repo and author: one glob is stored as a string (the form people write by hand).
		if (k === 'repo' || k === 'author') when[k] = list.length === 1 ? list[0] : list;
		else (when as Record<string, string[]>)[k] = list;
	}
	if (states.length) when.state = states;
	if (words.length) when.text = words.join(' ');
	return { when, errors };
}

const quote = (v: string) => (/[\s,":]/.test(v) ? `"${v.replace(/"/g, '')}"` : v);

/** Write conditions as a query, in the order of the rule editor's fields (words last). */
export function formatQuery(when: RuleMatch): string {
	const parts: string[] = [];
	for (const f of RULE_FIELDS) {
		const v = when[f.key];
		if (v === undefined) continue;
		if (f.key === 'bot' || f.key === 'draft') parts.push(`${v ? '' : '-'}is:${f.key}`);
		else if (f.key === 'state') parts.push(...asList(v).map((s) => `is:${s}`));
		else if (f.key === 'text') continue;
		else {
			const list = asList(v).map((x) => (f.key === 'type' ? (TYPE_NAMES[x] ?? x) : x));
			if (list.length) parts.push(`${f.key}:${list.map(quote).join(',')}`);
		}
	}
	// Free words last, as people type them.
	if (when.text) parts.push(...tokens(when.text).map(quote));
	return parts.join(' ');
}
