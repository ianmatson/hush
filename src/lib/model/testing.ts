import { groupChoice } from '../shared/categories';
import { DEFAULT_DASH } from '../shared/dashboard';
import type { SubjectFacts } from '../shared/subject';
import type { CategoryGroup, ItemView, TeamDTO } from '../shared/types';
import { identityInputOf, replyInputOf } from './analysis';
import { compileViews, type CompileContext } from './compile';
import { createEvaluator, type EvaluationContext } from './evaluate';
import { newSource } from './sources';
import type { Analysis, Attention, Item, ProjectFacet, Source, SourceSpec } from './types';

export const ME = 'ian';
export const NOW = Date.parse('2026-10-22T12:00:00Z');
export const ANALYSIS_VERSION = 'v1';

export const EFFORT: CategoryGroup = {
	id: 'effort',
	name: 'Effort',
	categories: [
		{
			id: 'low',
			name: 'Low',
			color: 'green',
			icon: 'lucide:timer',
			rule: '',
			description: 'minutes'
		},
		{ id: 'high', name: 'High', color: 'red', icon: 'lucide:clock', rule: '', description: 'hours' }
	]
};

export const IMPACT: CategoryGroup = {
	id: 'impact',
	name: 'Impact',
	categories: [
		{
			id: 'small',
			name: 'Small',
			color: 'green',
			icon: 'lucide:dot',
			rule: '',
			description: 'tiny'
		},
		{
			id: 'large',
			name: 'Large',
			color: 'red',
			icon: 'lucide:circle',
			rule: '',
			description: 'huge'
		}
	]
};

export const BY_TOPIC: CategoryGroup = {
	id: 'topic',
	name: 'Topic',
	categories: [
		{
			id: 'db',
			name: 'Database',
			color: 'blue',
			icon: 'lucide:database',
			rule: 'about:"database migrations"',
			description: ''
		},
		{
			id: 'other',
			name: 'Other',
			color: 'gray',
			icon: 'lucide:box',
			rule: '-about:"database migrations"',
			description: ''
		}
	]
};

export function facts(number: number, over: Partial<SubjectFacts> = {}): SubjectFacts {
	const at = new Date(NOW - 3600_000).toISOString();
	return {
		id: `PR_${number}`,
		kind: 'pr',
		repo: 'PostHog/posthog',
		number,
		title: `Change ${number}`,
		url: `https://github.com/PostHog/posthog/pull/${number}`,
		author: 'alice',
		authorAvatar: null,
		authorIsBot: false,
		createdAt: at,
		updatedAt: at,
		state: 'open',
		draft: false,
		labels: [],
		assignees: [],
		comments: 0,
		lastComment: null,
		ci: 'SUCCESS',
		reviewDecision: null,
		mergeable: 'MERGEABLE',
		additions: 1,
		deletions: 1,
		lastCommitAt: at,
		reviewRequests: [],
		requestEvents: [],
		myReview: null,
		latestReview: null,
		verdicts: [],
		openThreads: 0,
		...over
	};
}

export const noAttention = (): Attention => ({
	seen: null,
	markedUnread: false,
	snooze: null,
	muted: false,
	pins: []
});

export function item(subject: SubjectFacts, over: Partial<Omit<Item, 'facts' | 'id'>> = {}): Item {
	return {
		id: subject.id,
		revision: 1,
		facts: subject,
		project: { state: 'unavailable' } satisfies ProjectFacet,
		analysis: null,
		attention: noAttention(),
		...over
	};
}

export function answeredEffort(
	subject: SubjectFacts,
	categoryId: string,
	staleIdentity = false
): Analysis {
	return {
		version: ANALYSIS_VERSION,
		replyInput: replyInputOf(subject, ME),
		identityInput: staleIdentity ? 'old-identity' : identityInputOf(subject),
		about: {},
		choices: { [groupChoice(EFFORT)!.key]: categoryId }
	};
}

export const view = (id: string, searches: string[], over: Partial<ItemView> = {}): ItemView => ({
	id,
	name: id,
	searches,
	groupBy: 'none',
	...over
});

export function compileContext(over: Partial<CompileContext> = {}): CompileContext {
	return {
		dash: DEFAULT_DASH,
		categoryGroups: [EFFORT],
		smartDecisions: true,
		teams: [],
		analysisVersion: ANALYSIS_VERSION,
		now: NOW,
		...over
	};
}

export const team = (slug: string): TeamDTO => ({ slug, name: slug, org: slug.split('/')[0] });

export function sourceWith(spec: SourceSpec, ids: string[], over: Partial<Source> = {}): Source {
	return {
		...newSource(spec),
		window: {
			candidates: ids.map((id) => ({ id, updatedAt: new Date(NOW).toISOString() })),
			truncated: false
		},
		...over
	};
}

export interface World {
	views: ItemView[];
	items: Item[];
	results: Record<number, string[]>;
	now?: number;
	smartDecisions?: boolean;
	compile?: Partial<CompileContext>;
	sources?: (spec: SourceSpec, index: number) => Partial<Source>;
}

export function world(w: World) {
	const ctx = compileContext({
		...w.compile,
		smartDecisions: w.smartDecisions ?? true,
		now: w.now ?? NOW
	});
	const compiled = compileViews(w.views, ctx);
	const sources = new Map(
		compiled.sources.map((spec, index) => [
			spec.id,
			sourceWith(spec, w.results[index] ?? [], w.sources?.(spec, index))
		])
	);
	const evaluation: EvaluationContext = {
		me: ME,
		dash: ctx.dash,
		categoryGroups: ctx.categoryGroups,
		smartDecisions: ctx.smartDecisions,
		teams: ctx.teams,
		analysisVersion: ANALYSIS_VERSION,
		now: ctx.now,
		items: new Map(w.items.map((x) => [x.id, x])),
		sources
	};
	return { compiled, sources, evaluation, evaluator: createEvaluator(evaluation) };
}
