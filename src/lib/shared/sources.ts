import { subjectKeyOfUrl } from './subject';
import type { DashKind, DashSection } from './types';

export type Source = DashSection;

export const MAX_SOURCES = 20;
export const MAX_SOURCE_COUNT_SEARCHES = 10;
export const SOURCE_RESULTS_MAX = 100;
const SORTS = /(?:^|\s)sort:/i;
export const newestFirst = (query: string) =>
	SORTS.test(query) ? query : `${query} sort:updated-desc`;

export interface SourceCount {
	pr: number | null;
	issue: number | null;
}

const SCOPING =
	/(?:^|\s)(?:author|assignee|mentions|commenter|involves|reviewed-by|review-requested|user-review-requested|team-review-requested|team|repo|org|user|project):\S/i;

export const searchIsUnscoped = (query: string, scope = '') => !SCOPING.test(`${query} ${scope}`);
export const MAX_TRACKED = 50;
export const TRACKED_SOURCE: Source = {
	id: 'tracked',
	name: 'Tracked by you',
	query: '',
	enabled: true
};

export const DEFAULT_SOURCES: Source[] = [
	{
		id: 'review-requests',
		name: 'Review requests',
		query: 'is:pr is:open review-requested:@me',
		enabled: true
	},
	{ id: 'involves', name: 'Involves you', query: 'is:open involves:@me', enabled: true },
	{
		id: 'reviewed',
		name: 'You reviewed',
		query: 'is:pr is:open reviewed-by:@me -author:@me',
		enabled: true
	},
	{ id: 'team-mentioned', name: 'Mentions your teams', query: 'is:open team:@team', enabled: false }
];

const OLD_DEFAULT_SOURCE_QUERIES = [
	'is:pr is:open user-review-requested:@me',
	'is:pr is:open team-review-requested:@team',
	'is:open author:@me',
	'is:pr is:open reviewed-by:@me -author:@me',
	'is:open assignee:@me',
	'is:open mentions:@me',
	'is:issue is:open commenter:@me -author:@me',
	'is:open team:@team'
];

export function upgradeSources(sources: Source[]): Source[] {
	const unchanged =
		sources.length === OLD_DEFAULT_SOURCE_QUERIES.length &&
		sources.every(
			(s, k) =>
				s.query === OLD_DEFAULT_SOURCE_QUERIES[k] &&
				s.enabled === (s.query !== 'is:open team:@team')
		);
	return unchanged ? DEFAULT_SOURCES : sources;
}

export const DEFAULT_SOURCE_IDS = new Set(DEFAULT_SOURCES.map((s) => s.id));

const ONLY_PRS =
	/(?:^|\s)(?:is:pr|type:pr|is:merged|is:unmerged|draft:|review:|reviewed-by:|review-requested:|user-review-requested:|team-review-requested:|base:|head:)/i;
const ONLY_ISSUES = /(?:^|\s)(?:is:issue|type:issue)(?:\s|$)/i;
const NAMES_A_KIND = /(?:^|\s)(?:is:pr|is:issue|type:pr|type:issue)(?:\s|$)/i;

export function sourceKinds(query: string): DashKind[] {
	if (ONLY_ISSUES.test(query)) return ['issue'];
	if (ONLY_PRS.test(query)) return ['pr'];
	return ['pr', 'issue'];
}

export function sectionsFor(kind: DashKind, sources: Source[]): DashSection[] {
	return sources
		.filter((s) => sourceKinds(s.query).includes(kind))
		.map((s) => ({
			...s,
			query: NAMES_A_KIND.test(s.query) ? s.query : `is:${kind} ${s.query}`.trim()
		}));
}

export function trackedKeyOf(input: string): string | null {
	const text = input.trim();
	const fromUrl = subjectKeyOfUrl(text);
	if (fromUrl) return fromUrl;
	const short = /^([\w.-]+\/[\w.-]+)#(\d+)$/.exec(text);
	return short ? `${short[1]}#${Number(short[2])}` : null;
}

export function validateSources(sources: unknown): string | null {
	if (!Array.isArray(sources)) return 'Sources must be a list.';
	if (sources.length > MAX_SOURCES) return `Up to ${MAX_SOURCES} sources are allowed.`;
	const ids = new Set<string>();
	for (const s of sources as Source[]) {
		if (typeof s?.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(s.id))
			return 'Each source needs a short id.';
		if (s.id === TRACKED_SOURCE.id) return `“${TRACKED_SOURCE.id}” is kept for tracked items.`;
		if (ids.has(s.id)) return `Two sources use the id "${s.id}".`;
		ids.add(s.id);
		if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 60)
			return 'Each source needs a name (60 characters or fewer).';
		if (typeof s.query !== 'string' || !s.query.trim() || s.query.length > 256)
			return `"${s.name}": the search must have 1–256 characters.`;
		if (typeof s.enabled !== 'boolean') return `"${s.name}": "enabled" must be true or false.`;
	}
	return null;
}

export function validateTracked(tracked: unknown): string | null {
	if (!Array.isArray(tracked)) return 'Tracked items must be a list.';
	if (tracked.length > MAX_TRACKED) return `Up to ${MAX_TRACKED} tracked items are allowed.`;
	for (const key of tracked)
		if (typeof key !== 'string' || trackedKeyOf(key) !== key)
			return `“${String(key)}” is not a PR or issue such as "owner/repo#123".`;
	return null;
}
