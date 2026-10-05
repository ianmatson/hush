export interface SearchCondition {
	key: string;
	negate: boolean;
	value: string;
}

export interface SearchField {
	key: string;
	label: string;
	options?: { value: string; label: string }[];
	placeholder?: string;
	canNegate: boolean;
}

export const RAW_KEY = 'raw';
const IS_KIND = 'is-kind';
const IS_STATE = 'is-state';

const KIND_OPTIONS = [
	{ value: 'pr', label: 'Pull request' },
	{ value: 'issue', label: 'Issue' }
];
const STATE_OPTIONS = [
	{ value: 'open', label: 'Open' },
	{ value: 'closed', label: 'Closed' },
	{ value: 'merged', label: 'Merged' }
];
const PERSON = '@me or a login';

export const SEARCH_FIELDS: SearchField[] = [
	{ key: IS_KIND, label: 'Type', options: KIND_OPTIONS, canNegate: false },
	{ key: IS_STATE, label: 'State', options: STATE_OPTIONS, canNegate: true },
	{ key: 'author', label: 'Author', placeholder: PERSON, canNegate: true },
	{ key: 'assignee', label: 'Assignee', placeholder: PERSON, canNegate: true },
	{ key: 'mentions', label: 'Mentions', placeholder: PERSON, canNegate: true },
	{ key: 'commenter', label: 'Commented by', placeholder: PERSON, canNegate: true },
	{ key: 'involves', label: 'Involves', placeholder: PERSON, canNegate: true },
	{ key: 'reviewed-by', label: 'Reviewed by', placeholder: PERSON, canNegate: true },
	{
		key: 'user-review-requested',
		label: 'Review requested from person',
		placeholder: PERSON,
		canNegate: true
	},
	{
		key: 'team-review-requested',
		label: 'Review requested from team',
		placeholder: '@team or org/team',
		canNegate: true
	},
	{ key: 'team', label: 'Mentions team', placeholder: '@team or org/team', canNegate: true },
	{ key: 'label', label: 'Label', placeholder: 'bug', canNegate: true },
	{ key: 'repo', label: 'Repository', placeholder: 'owner/repo', canNegate: true },
	{ key: 'org', label: 'Organization', placeholder: 'acme', canNegate: true },
	{ key: 'base', label: 'Base branch', placeholder: 'main', canNegate: true },
	{
		key: 'draft',
		label: 'Draft',
		options: [
			{ value: 'true', label: 'Yes' },
			{ value: 'false', label: 'No' }
		],
		canNegate: false
	},
	{ key: RAW_KEY, label: 'Other (GitHub syntax)', placeholder: 'archived:false', canNegate: false }
];

export const searchField = (key: string) => SEARCH_FIELDS.find((f) => f.key === key);

const KINDS = new Set(KIND_OPTIONS.map((o) => o.value));
const STATES = new Set(STATE_OPTIONS.map((o) => o.value));
const KNOWN = new Set(SEARCH_FIELDS.map((f) => f.key));

export function parseSearch(query: string): SearchCondition[] {
	const out: SearchCondition[] = [];
	for (const token of query.match(/(?:[^\s"]+|"[^"]*")+/g) ?? []) {
		const m = /^(-?)([a-z][a-z-]*):(.+)$/i.exec(token);
		if (!m) {
			out.push({ key: RAW_KEY, negate: false, value: token });
			continue;
		}
		const negate = m[1] === '-';
		const key = m[2].toLowerCase();
		const value = m[3].replace(/^"|"$/g, '');
		if (key === 'is' && !negate && KINDS.has(value)) out.push({ key: IS_KIND, negate, value });
		else if (key === 'is' && STATES.has(value)) out.push({ key: IS_STATE, negate, value });
		else if (KNOWN.has(key) && key !== RAW_KEY && !key.startsWith('is-'))
			out.push({ key, negate, value });
		else out.push({ key: RAW_KEY, negate: false, value: token });
	}
	return out;
}

const quote = (v: string) => (/\s/.test(v) ? `"${v.replace(/"/g, '')}"` : v);

export function formatSearch(conditions: SearchCondition[]): string {
	return conditions
		.filter((c) => c.value.trim())
		.map((c) => {
			if (c.key === RAW_KEY) return c.value.trim();
			const key = c.key === IS_KIND || c.key === IS_STATE ? 'is' : c.key;
			return `${c.negate ? '-' : ''}${key}:${quote(c.value.trim())}`;
		})
		.join(' ');
}

const VERB_FIELDS = new Set([
	'mentions',
	'commenter',
	'involves',
	'reviewed-by',
	'user-review-requested',
	'team-review-requested',
	'team'
]);

function describeOne(c: SearchCondition): string {
	const field = searchField(c.key);
	if (c.key === RAW_KEY) return c.value;
	const option = field?.options?.find((o) => o.value === c.value);
	const value = option ? option.label.toLowerCase() : c.value;
	const label = field?.label.toLowerCase() ?? c.key;
	if (VERB_FIELDS.has(c.key)) return `${c.negate ? 'not ' : ''}${label} ${value}`;
	return `${label} ${c.negate ? 'is not' : 'is'} ${value}`;
}

export function describeSearch(conditions: SearchCondition[]): string {
	const parts = conditions.filter((c) => c.value.trim()).map(describeOne);
	if (!parts.length) return 'Every open item GitHub can see.';
	const text =
		parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`;
	return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}
