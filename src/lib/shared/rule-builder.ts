import { formatQuery, IS_VALUES, parseExpr, WORDS, type QueryExpr } from './query';

export type BuilderMode = 'all' | 'any';

export interface BuilderCondition {
	type: 'condition';
	word: string;
	negate: boolean;
	values: string[];
}

export interface BuilderGroup {
	type: 'group';
	mode: BuilderMode;
	conditions: BuilderCondition[];
}

export interface BuilderState {
	mode: BuilderMode;
	items: (BuilderCondition | BuilderGroup)[];
}

export const TEXT_WORD = 'text';
export const IS_WORD = 'is';
const BOTS_VALUE = 'bots';

export type FieldInput = 'list' | 'choice' | 'size' | 'about' | 'text';

export interface BuilderField {
	word: string;
	label: string;
	input: FieldInput;
	placeholder?: string;
	help?: string;
	options?: { value: string; label: string }[];
	suggest?: 'repo' | 'person' | 'label' | 'source' | 'category';
	canNegate: boolean;
}

const LABELS: Record<
	string,
	{ label: string; placeholder?: string; suggest?: BuilderField['suggest'] }
> = {
	repo: { label: 'Repository', placeholder: 'acme/web or acme/*', suggest: 'repo' },
	author: { label: 'Author', placeholder: 'octocat, dependabot*, or bots', suggest: 'person' },
	from: { label: 'Latest activity by', placeholder: 'octocat or bots', suggest: 'person' },
	label: { label: 'Label', placeholder: 'bug', suggest: 'label' },
	assignee: { label: 'Assignee', placeholder: '@me or octocat', suggest: 'person' },
	'review-requested': {
		label: 'Review requested from',
		placeholder: '@me, octocat, or acme/team',
		suggest: 'person'
	},
	size: { label: 'Size' },
	category: { label: 'Category', suggest: 'category' },
	source: { label: 'Source', suggest: 'source' },
	about: { label: 'About (Jev decides)', placeholder: 'database migrations' },
	type: { label: 'Type' },
	event: { label: 'Why GitHub notified you' },
	needs: { label: 'What you must do' },
	in: { label: 'Hush’s list' }
};

const CHOICE_INPUTS: Record<string, FieldInput> = { size: 'size', about: 'about' };

export const BUILDER_FIELDS: BuilderField[] = [
	...WORDS.map((w): BuilderField => {
		const info = LABELS[w.key] ?? { label: w.key };
		return {
			word: w.key,
			label: info.label,
			input: CHOICE_INPUTS[w.key] ?? (w.values ? 'choice' : 'list'),
			placeholder: info.placeholder,
			help: w.help,
			options: w.values
				? Object.entries(w.values).map(([value, v]) => ({ value, label: v.help }))
				: undefined,
			suggest: info.suggest,
			canNegate: true
		};
	}),
	{
		word: IS_WORD,
		label: 'State',
		input: 'choice',
		options: Object.entries(IS_VALUES).map(([value, label]) => ({ value, label })),
		canNegate: true
	},
	{
		word: TEXT_WORD,
		label: 'Title, repository, or author contains',
		input: 'text',
		placeholder: 'words',
		canNegate: true
	}
];

export const builderField = (word: string) => BUILDER_FIELDS.find((f) => f.word === word);

export const emptyCondition = (word = 'repo'): BuilderCondition => ({
	type: 'condition',
	word,
	negate: false,
	values: []
});

export const EMPTY_BUILDER: BuilderState = { mode: 'all', items: [] };

const quote = (x: string) => (/[\s,":()]/.test(x) ? `"${x.replace(/"/g, '')}"` : x);

const isComplete = (c: BuilderCondition) => c.values.some((v) => v.trim());

function conditionText(c: BuilderCondition): string {
	const values = c.values.map((v) => v.trim()).filter(Boolean);
	if (c.word === TEXT_WORD) {
		const words = values.flatMap((v) => v.split(/\s+/)).filter(Boolean);
		return words.map((w) => `${c.negate ? '-' : ''}${quote(w)}`).join(' ');
	}
	return `${c.negate ? '-' : ''}${c.word}:${values.map(quote).join(',')}`;
}

const join = (parts: string[], mode: BuilderMode) => parts.join(mode === 'all' ? ' ' : ' OR ');

export function builderToQuery(state: BuilderState): string {
	const top = state.items.flatMap((item) => {
		if (item.type === 'condition') return isComplete(item) ? [conditionText(item)] : [];
		const inner = item.conditions.filter(isComplete).map(conditionText);
		if (!inner.length) return [];
		return [inner.length === 1 ? inner[0] : `(${join(inner, item.mode)})`];
	});
	return join(top, state.mode);
}

function conditionsOfText(text: string, negate: boolean): BuilderCondition[] {
	const out: BuilderCondition[] = [];
	const words: string[] = [];
	for (const part of text.match(/(?:[^\s"]+|"[^"]*")+/g) ?? []) {
		const m = /^(-?)([a-z][a-z-]*):(.+)$/i.exec(part);
		if (!m) {
			words.push(part.replace(/"/g, ''));
			continue;
		}
		const values = [...m[3].matchAll(/(?:[^,"]+|"[^"]*")+/g)].map((x) => x[0].replace(/"/g, ''));
		const own = m[1] === '-';
		out.push({ type: 'condition', word: m[2].toLowerCase(), negate: own !== negate, values });
	}
	if (words.length)
		out.push({ type: 'condition', word: TEXT_WORD, negate, values: [words.join(' ')] });
	return out;
}

function leafConditions(expr: QueryExpr): BuilderCondition[] | null {
	if (expr.kind === 'match') return conditionsOfText(formatQuery(expr.when), false);
	if (expr.kind === 'not' && expr.part.kind === 'match') {
		const inner = conditionsOfText(formatQuery(expr.part.when), true);
		return inner.length === 1 ? inner : null;
	}
	return null;
}

function groupOf(expr: QueryExpr): BuilderGroup | null {
	if (expr.kind === 'and' || expr.kind === 'or') {
		const conditions: BuilderCondition[] = [];
		for (const part of expr.parts) {
			const leaf = leafConditions(part);
			if (!leaf) return null;
			if (expr.kind === 'or' && leaf.length > 1) return null;
			conditions.push(...leaf);
		}
		return { type: 'group', mode: expr.kind === 'and' ? 'all' : 'any', conditions };
	}
	const leaf = leafConditions(expr);
	if (!leaf || leaf.length < 2) return null;
	return { type: 'group', mode: 'all', conditions: leaf };
}

export function queryToBuilder(query: string): BuilderState | null {
	if (!query.trim()) return { mode: 'all', items: [] };
	const { expr, errors } = parseExpr(query);
	if (errors.length) return null;
	const mode: BuilderMode = expr.kind === 'or' ? 'any' : 'all';
	const parts = expr.kind === 'and' || expr.kind === 'or' ? expr.parts : [expr];
	const items: BuilderState['items'] = [];
	for (const part of parts) {
		const leaf = leafConditions(part);
		if (leaf && (mode === 'all' || leaf.length === 1)) {
			items.push(...leaf);
			continue;
		}
		const group = groupOf(part);
		if (!group || (group.mode === mode && mode === 'all')) {
			if (group && mode === 'all') {
				items.push(...group.conditions);
				continue;
			}
			return null;
		}
		items.push(group);
	}
	return { mode, items };
}

function sizeWords(spec: string): string {
	const range = /^(\d+)\.\.(\d+)$/.exec(spec);
	if (range) return `${range[1]} to ${range[2]}`;
	const m = /^(<=|>=|<|>)?(\d+)$/.exec(spec);
	if (!m) return spec;
	const words: Record<string, string> = {
		'<': 'under',
		'>': 'over',
		'<=': 'at most',
		'>=': 'at least'
	};
	return m[1] ? `${words[m[1]]} ${m[2]}` : m[2];
}

export function describeCondition(c: BuilderCondition): string {
	const field = builderField(c.word);
	const values = c.values.filter((v) => v.trim());
	if (!values.length) return '';
	const shown = values.map((v) => {
		if (v.toLowerCase() === BOTS_VALUE && (c.word === 'author' || c.word === 'from'))
			return 'a bot';
		const option = field?.options?.find((o) => o.value === v);
		return option ? option.label.toLowerCase() : v;
	});
	const list =
		shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(', ')} or ${shown.at(-1)}`;
	const label = (field?.label ?? c.word).replace(/ \(Jev decides\)$/, '');
	const not = c.negate ? 'not ' : '';
	if (c.word === IS_WORD) return `${not}${list.toLowerCase()}`;
	if (c.word === 'about') return `${not}about “${values.join('” or “')}”`;
	if (c.word === 'size') return `${not}${values.map(sizeWords).join(' or ')} changed lines`;
	return `${label.toLowerCase()} ${c.negate ? 'is not' : 'is'} ${list}`;
}

export const MATCHES_EVERYTHING = 'Matches everything.';

export function describeBuilder(state: BuilderState): string {
	const joinWords = (parts: string[], mode: BuilderMode) =>
		parts.length <= 1
			? (parts[0] ?? '')
			: `${parts.slice(0, -1).join(', ')} ${mode === 'all' ? 'and' : 'or'} ${parts.at(-1)}`;
	const parts = state.items
		.map((item) => {
			if (item.type === 'condition') return describeCondition(item);
			const inner = item.conditions.map(describeCondition).filter(Boolean);
			return inner.length > 1 ? `(${joinWords(inner, item.mode)})` : (inner[0] ?? '');
		})
		.filter(Boolean);
	if (!parts.length) return MATCHES_EVERYTHING;
	const text = joinWords(parts, state.mode);
	return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}
