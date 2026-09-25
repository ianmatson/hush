import { WHY } from './classify';
import type { RuleMatch } from './types';

/**
 * The conditions a rule can have, for the visual rule editor. One entry per RuleMatch key; the
 * editor picks its input from `input`.
 */
export type RuleField = keyof RuleMatch;

export interface RuleFieldInfo {
	key: RuleField;
	label: string;
	/** How the value is edited. `globs`: text with * and ?; `options`: pick from a list. */
	input: 'globs' | 'options' | 'text' | 'yesno';
	/** Shown under the field. */
	help?: string;
	options?: { value: string; label: string }[];
	/** For yes/no: what "yes" means. */
	yes?: string;
	no?: string;
}

const KINDS: { value: string; label: string }[] = [
	{ value: 'review', label: 'Review' },
	{ value: 'fix_ci', label: 'Fix CI' },
	{ value: 'address_review', label: 'Address review' },
	{ value: 'resolve_conflict', label: 'Resolve conflict' },
	{ value: 'merge', label: 'Merge' },
	{ value: 'reply', label: 'Reply' },
	{ value: 'triage', label: 'Triage' },
	{ value: 'security', label: 'Security' },
	{ value: 'none', label: 'None (FYI)' }
];

const TYPES: { value: string; label: string }[] = [
	{ value: 'PullRequest', label: 'Pull request' },
	{ value: 'Issue', label: 'Issue' },
	{ value: 'CheckSuite', label: 'Workflow run' },
	{ value: 'Release', label: 'Release' },
	{ value: 'Discussion', label: 'Discussion' },
	{ value: 'Commit', label: 'Commit' },
	{ value: 'RepositoryVulnerabilityAlert', label: 'Vulnerability alert' },
	{ value: 'RepositoryDependabotAlertsThread', label: 'Dependabot alerts' }
];

export const RULE_FIELDS: RuleFieldInfo[] = [
	{
		key: 'repo',
		label: 'Repository',
		input: 'globs',
		help: 'owner/repo. * matches anything, for example PostHog/*.'
	},
	{
		key: 'author',
		label: 'Author',
		input: 'globs',
		help: 'The PR or issue author. * matches anything, for example dependabot*.'
	},
	{
		key: 'type',
		label: 'Type',
		input: 'options',
		options: TYPES
	},
	{
		key: 'reason',
		label: 'Why GitHub notified you',
		input: 'options',
		options: Object.entries(WHY).map(([value, label]) => ({ value, label }))
	},
	{
		key: 'kind',
		label: 'What Hush thinks you must do',
		input: 'options',
		help: 'Before rules. "None" is everything that is FYI by default.',
		options: KINDS
	},
	{
		key: 'category',
		label: 'Hush’s default',
		input: 'options',
		help: 'Where the thread goes when no rule matches.',
		options: [
			{ value: 'action', label: 'Needs you' },
			{ value: 'fyi', label: 'FYI' }
		]
	},
	{ key: 'titleContains', label: 'Title contains', input: 'text', help: 'Not case-sensitive.' },
	{
		key: 'label',
		label: 'Has label',
		input: 'globs',
		help: 'Any of these labels (exact names).'
	},
	{ key: 'bot', label: 'Author is a bot', input: 'yesno', yes: 'Bot', no: 'Person' },
	{ key: 'draft', label: 'Draft PR', input: 'yesno', yes: 'Draft', no: 'Ready' }
];

export const fieldInfo = (key: string) => RULE_FIELDS.find((f) => f.key === key);

/** A list value in the editor, whatever the stored form (one glob or a list). */
export function asList(v: unknown): string[] {
	return v === undefined ? [] : Array.isArray(v) ? v.map(String) : [String(v)];
}

/** Say a condition in words, for the collapsed rule summary. */
export function describeCondition(key: RuleField, v: unknown): string {
	const f = fieldInfo(key);
	if (!f) return key;
	if (f.input === 'yesno') return v ? f.yes! : f.no!;
	if (f.input === 'text') return `${f.label.toLowerCase()} “${v}”`;
	const values = asList(v).map((x) => f.options?.find((o) => o.value === x)?.label ?? x);
	return `${f.label.toLowerCase()} ${values.length > 1 ? `is ${values.slice(0, -1).join(', ')} or ${values.at(-1)}` : `is ${values[0] ?? '…'}`}`;
}
