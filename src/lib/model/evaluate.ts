import { categoryQueryName, groupChoice, itemCategoriesIn, placeItem } from '../shared/categories';
import { changesSince } from '../shared/changes';
import { stillKept, KEEP_CLOSED_MS, closedTimeOf } from '../shared/closed-items';
import { finishItem, keepItem, sortItems } from '../shared/dashboard';
import {
	identityHash,
	NO_DECISIONS,
	readDecisions,
	type SubjectDecisions
} from '../shared/decisions';
import { DAY_MS } from '../shared/durations';
import { isUnread, type SnoozeChoice } from '../shared/item-snooze';
import { requestedByName, sameLogin } from '../shared/logins';
import { queryMatches } from '../shared/rules';
import { snoozeOutcome } from '../shared/snooze';
import { dashFactsOf, enrichmentOf, subjectRuleFacts, type SubjectFacts } from '../shared/subject';
import type { CategoryGroup, DashSettings, RuleFacts, TeamDTO } from '../shared/types';
import type { DashFacts } from '../shared/dashboard';
import { filtersByCategory } from './compile';
import { sourceHealth, staleUntil, usableWindow } from './sources';
import type {
	Attention,
	Clause,
	CompiledView,
	Item,
	ItemId,
	Membership,
	ProjectFacet,
	Row,
	Snooze,
	Source,
	ViewState
} from './types';

export interface EvaluationContext {
	me: string;
	dash: DashSettings;
	categoryGroups: CategoryGroup[];
	smartDecisions: boolean;
	teams: TeamDTO[];
	analysisVersion: string;
	now: number;
	items: ReadonlyMap<ItemId, Item>;
	sources: ReadonlyMap<string, Source>;
}

export type AttentionState =
	{ kind: 'awake' } | { kind: 'muted' } | { kind: 'snoozed'; choice: SnoozeChoice };

interface Derived {
	facts: DashFacts;
	ruleFacts: RuleFacts;
	categories: string[];
	pinnedCategories: string[];
	categoriesUnknown: boolean;
	analysisStale: boolean;
}

export interface ViewEvaluation {
	membership: Membership;
	rows: Row[];
	nextBoundary: number | null;
}

interface UsableAnalysis {
	decisions: SubjectDecisions;
	known: boolean;
	stale: boolean;
}

export function usableAnalysis(item: Item, version: string): UsableAnalysis {
	const { analysis, facts } = item;
	if (!analysis || analysis.version !== version)
		return { decisions: NO_DECISIONS, known: false, stale: false };
	const known = analysis.answers.identityHash !== undefined;
	const currentIdentity = identityHash(facts);
	return {
		decisions: readDecisions({ ...analysis.answers, identityHash: currentIdentity }, facts),
		known,
		stale: known && analysis.answers.identityHash !== currentIdentity
	};
}

export function snoozeIsOver(snooze: Snooze, facts: SubjectFacts, me: string, now: number) {
	if (snooze.kind === 'activity')
		return Date.parse(facts.updatedAt) > Date.parse(snooze.activityAt);
	if (snooze.kind === 'time') return now >= snooze.until;
	return (
		now >= snooze.until || snoozeOutcome(snooze.event, enrichmentOf(facts), snooze.at, me).wake
	);
}

const choiceOf = (snooze: Snooze): SnoozeChoice =>
	snooze.kind === 'time'
		? { until: snooze.until }
		: snooze.kind === 'event'
			? { event: snooze.event }
			: {};

export function attentionState(
	attention: Attention,
	facts: SubjectFacts,
	me: string,
	now: number
): AttentionState {
	if (attention.muted) return { kind: 'muted' };
	if (!attention.snooze || snoozeIsOver(attention.snooze, facts, me, now)) return { kind: 'awake' };
	return { kind: 'snoozed', choice: choiceOf(attention.snooze) };
}

const passesTeams = (clause: Clause, facts: SubjectFacts, me: string) =>
	!clause.teams ||
	facts.reviewRequests.some(
		(request) => request.team && clause.teams!.some((team) => sameLogin(team, request.name))
	) ||
	(clause.orDirect && requestedByName(facts.reviewRequests, me));

function projectFields(project: ProjectFacet): Pick<Row, 'projectStatus' | 'projectStatusUnknown'> {
	if (project.state === 'known')
		return { projectStatus: project.statuses, projectStatusUnknown: false };
	if (project.state === 'unknown') return { projectStatusUnknown: true };
	return {};
}

const minimum = (values: (number | null)[], after: number) =>
	values.reduce<number | null>(
		(soonest, value) =>
			value !== null && value > after && (soonest === null || value < soonest) ? value : soonest,
		null
	);

export function createEvaluator(ctx: EvaluationContext) {
	const teamSlugs = new Set(ctx.teams.map((team) => team.slug));
	const jevGroups = ctx.smartDecisions
		? ctx.categoryGroups.filter((group) => groupChoice(group))
		: [];
	const derivedById = new Map<ItemId, Derived>();

	function derive(item: Item): Derived {
		const cached = derivedById.get(item.id);
		if (cached) return cached;
		const analysis = usableAnalysis(item, ctx.analysisVersion);
		const base = subjectRuleFacts(item.facts, ctx.me, analysis.decisions);
		const placement = placeItem(base, item.attention.pins, ctx.categoryGroups);
		const leftToJev = jevGroups.some(
			(group) => !group.categories.some((category) => placement.categories.includes(category.id))
		);
		const derived: Derived = {
			facts: dashFactsOf(item.facts, ctx.me, teamSlugs, analysis.decisions),
			ruleFacts: {
				...base,
				categories: itemCategoriesIn(ctx.categoryGroups, placement.categories).map(
					({ group, category }) => categoryQueryName(group, category)
				),
				now: ctx.now
			},
			categories: placement.categories,
			pinnedCategories: placement.pinned,
			categoriesUnknown: leftToJev && !analysis.known,
			analysisStale: jevGroups.length > 0 && analysis.stale
		};
		derivedById.set(item.id, derived);
		return derived;
	}

	function clausePasses(clause: Clause, item: Item, derived: Derived) {
		const { facts } = item;
		if (facts.kind !== clause.kind) return false;
		if (clause.openOnly && facts.state !== 'open') return false;
		if (!passesTeams(clause, facts, ctx.me)) return false;
		if (!clause.onBoard && !keepItem(derived.facts, ctx.me, ctx.dash)) return false;
		return !clause.local || queryMatches(clause.local, derived.ruleFacts);
	}

	function membership(view: CompiledView): Membership {
		const candidates = new Set<ItemId>();
		const members = new Set<ItemId>();
		const settledMembers = new Set<ItemId>();
		const waiting = new Set<ItemId>();
		const validBindings = new Set<string>();
		for (const clause of view.clauses) {
			const window = usableWindow(ctx.sources.get(clause.sourceId), ctx.now);
			if (!window) continue;
			validBindings.add(clause.binding);
			for (const candidate of window.candidates) {
				candidates.add(candidate.id);
				const item = ctx.items.get(candidate.id);
				if (!item) {
					waiting.add(candidate.id);
					continue;
				}
				const derived = derive(item);
				const dependsOnAnalysis =
					filtersByCategory(clause.local) && (derived.categoriesUnknown || derived.analysisStale);
				if (dependsOnAnalysis) waiting.add(item.id);
				if (derived.categoriesUnknown && dependsOnAnalysis) continue;
				if (!clausePasses(clause, item, derived)) continue;
				members.add(item.id);
				if (!dependsOnAnalysis) settledMembers.add(item.id);
			}
		}
		const unsettled = new Set([...waiting].filter((id) => !settledMembers.has(id)));
		const health = [...new Set(view.clauses.map((clause) => clause.sourceId))].map((id) =>
			sourceHealth(ctx.sources.get(id), id, ctx.now)
		);
		return { candidates, members, unsettled, validBindings, health };
	}

	const retainedIn = (view: CompiledView, state: ViewState | null, members: Set<ItemId>) =>
		view.view.keepClosed === false || state?.scope !== view.scope
			? []
			: state.retained.filter((id) => {
					const item = ctx.items.get(id);
					return (
						!!item &&
						!members.has(id) &&
						item.facts.state !== 'open' &&
						stillKept(item.facts, ctx.now)
					);
				});

	function rowOf(item: Item, retained: boolean): Row {
		const derived = derive(item);
		const finished = finishItem(derived.facts, [], [], ctx.me, ctx.dash.staleDays, ctx.now);
		const { sections: _sections, ...turned } = finished;
		const state = attentionState(item.attention, item.facts, ctx.me, ctx.now);
		const seen = item.attention.seen;
		const changes = seen ? changesSince(seen.snapshot, item.facts, ctx.me) : [];
		const seenAt = seen?.at ?? null;
		return {
			...turned,
			...projectFields(item.project),
			itemId: item.id,
			retained,
			analysisStale: derived.analysisStale,
			categories: derived.categories,
			pinnedCategories: derived.pinnedCategories,
			dismissed: state.kind !== 'awake',
			muted: state.kind === 'muted',
			snooze: state.kind === 'snoozed' ? state.choice : undefined,
			changes,
			seenAt,
			unread: item.attention.markedUnread || isUnread(seenAt, changes)
		};
	}

	function nextBoundary(view: CompiledView, rows: Row[]): number | null {
		const stalesAt = (row: Row) =>
			row.turn === 'none' ? null : Date.parse(row.waitingSince) + ctx.dash.staleDays * DAY_MS;
		const snoozeEnds = (row: Row) => {
			const snooze = ctx.items.get(row.itemId)?.attention.snooze;
			return snooze && snooze.kind !== 'activity' ? snooze.until : null;
		};
		const retentionEnds = (row: Row) =>
			row.retained ? Date.parse(closedTimeOf(row)) + KEEP_CLOSED_MS : null;
		const sourceStaleEnds = view.clauses.map((clause) => {
			const source = ctx.sources.get(clause.sourceId);
			return source ? staleUntil(source) : null;
		});
		return minimum(
			[
				...rows.flatMap((row) => [stalesAt(row), snoozeEnds(row), retentionEnds(row)]),
				...sourceStaleEnds
			],
			ctx.now
		);
	}

	function evaluate(view: CompiledView, state: ViewState | null): ViewEvaluation {
		const found = membership(view);
		const retained = retainedIn(view, state, found.members);
		const rows = sortItems([
			...[...found.members].map((id) => rowOf(ctx.items.get(id)!, false)),
			...retained.map((id) => rowOf(ctx.items.get(id)!, true))
		]);
		return { membership: found, rows, nextBoundary: nextBoundary(view, rows) };
	}

	return { membership, evaluate, derive, clausePasses };
}
