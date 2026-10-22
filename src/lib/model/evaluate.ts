import { allCategories } from '../shared/categories';
import { changesSince, snapshotOf } from '../shared/changes';
import { stillKept, KEEP_CLOSED_MS, closedTimeOf } from '../shared/closed-items';
import { finishItem, keepItem, sortItems } from '../shared/dashboard';
import { DAY_MS } from '../shared/durations';
import { isUnread, type SnoozeChoice } from '../shared/item-snooze';
import { requestedByName, sameLogin } from '../shared/logins';
import { snoozeOutcome } from '../shared/snooze';
import { dashFactsOf, enrichmentOf, subjectRuleFacts, type SubjectFacts } from '../shared/subject';
import type { CategoryGroup, DashSettings, RuleFacts, TeamDTO } from '../shared/types';
import type { DashFacts } from '../shared/dashboard';
import { analysisView, type AnalysisView } from './analysis';
import {
	placeGroups,
	placedCategory,
	queryTri,
	type GroupPlacement,
	type Tri
} from './eligibility';
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
	analysis: AnalysisView;
	strict: GroupPlacement[];
	lenient: GroupPlacement[];
	pinnedCategories: string[];
}

type Certainty = 'strict' | 'lenient';

export interface ViewEvaluation {
	membership: Membership;
	rows: Row[];
	nextBoundary: number | null;
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

export function holdsAlerts(item: Item, me: string, now: number) {
	const state = attentionState(item.attention, item.facts, me, now);
	return (
		state.kind === 'muted' ||
		(state.kind === 'snoozed' && (!!state.choice.event || state.choice.until !== undefined))
	);
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

const RELATIVE_DAY = /@today/i;

const nextDayStart = (now: number) => Math.floor(now / DAY_MS) * DAY_MS + DAY_MS;

const knownCategories = (placements: GroupPlacement[]) =>
	placements.flatMap((placement) => placedCategory(placement) ?? []);

const minimum = (values: (number | null)[], after: number) =>
	values.reduce<number | null>(
		(soonest, value) =>
			value !== null && value > after && (soonest === null || value < soonest) ? value : soonest,
		null
	);

export function createEvaluator(ctx: EvaluationContext) {
	const teamSlugs = new Set(ctx.teams.map((team) => team.slug));
	const categoryIds = new Set(allCategories(ctx.categoryGroups).map((category) => category.id));
	const rulesUseRelativeDays = allCategories(ctx.categoryGroups).some((category) =>
		RELATIVE_DAY.test(category.rule)
	);
	const derivedById = new Map<ItemId, Derived>();

	function derive(item: Item): Derived {
		const cached = derivedById.get(item.id);
		if (cached) return cached;
		const { facts, attention } = item;
		const analysis = analysisView(
			item.analysis,
			facts,
			ctx.me,
			ctx.smartDecisions,
			ctx.analysisVersion
		);
		const ruleFacts = { ...subjectRuleFacts(facts, ctx.me, analysis.decisions), now: ctx.now };
		const place = (certainty: Certainty) =>
			placeGroups(ctx.categoryGroups, ruleFacts, attention.pins, analysis[certainty]);
		const strict = place('strict');
		const derived: Derived = {
			facts: dashFactsOf(facts, ctx.me, teamSlugs, analysis.decisions),
			ruleFacts,
			analysis,
			strict,
			lenient: analysis.lenient === analysis.strict ? strict : place('lenient'),
			pinnedCategories: attention.pins.filter((id) => categoryIds.has(id))
		};
		derivedById.set(item.id, derived);
		return derived;
	}

	function clauseTri(clause: Clause, item: Item, certainty: Certainty): Tri {
		const { facts } = item;
		const derived = derive(item);
		if (facts.kind !== clause.kind) return false;
		if (clause.openOnly && facts.state !== 'open') return false;
		if (!passesTeams(clause, facts, ctx.me)) return false;
		if (!clause.onBoard && !keepItem(derived.facts, ctx.me, ctx.dash)) return false;
		return queryTri(
			clause.local,
			derived.ruleFacts,
			derived.analysis[certainty],
			derived[certainty]
		);
	}

	function membership(view: CompiledView): Membership {
		const candidates = new Set<ItemId>();
		const members = new Set<ItemId>();
		const settledMembers = new Set<ItemId>();
		const waiting = new Set<ItemId>();
		const validBindings = new Set<string>();
		const acceptedBy = new Map<string, Set<ItemId>>();
		const accept = (binding: string, id: ItemId) => {
			const accepted = acceptedBy.get(binding) ?? new Set<ItemId>();
			accepted.add(id);
			acceptedBy.set(binding, accepted);
		};
		for (const clause of view.clauses) {
			const window = usableWindow(ctx.sources.get(clause.sourceId), ctx.now);
			if (!window) continue;
			validBindings.add(clause.binding);
			for (const { id } of window.candidates) {
				candidates.add(id);
				const item = ctx.items.get(id);
				if (!item) {
					waiting.add(id);
					continue;
				}
				const strict = clauseTri(clause, item, 'strict');
				if (strict === true) {
					members.add(id);
					settledMembers.add(id);
					accept(clause.binding, id);
				} else if (strict === null) {
					waiting.add(id);
					if (clauseTri(clause, item, 'lenient') === true) {
						members.add(id);
						accept(clause.binding, id);
					}
				}
			}
		}
		const unsettled = new Set([...waiting].filter((id) => !settledMembers.has(id)));
		const health = [...new Set(view.clauses.map((clause) => clause.sourceId))].map((id) =>
			sourceHealth(ctx.sources.get(id), id, ctx.now)
		);
		return { candidates, members, unsettled, validBindings, acceptedBy, health };
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
		const turned = finishItem(derived.facts, ctx.me, ctx.dash.staleDays, ctx.now);
		const state = attentionState(item.attention, item.facts, ctx.me, ctx.now);
		const seen = item.attention.seen;
		const changes = seen ? changesSince(seen.snapshot, item.facts, ctx.me) : [];
		const seenAt = seen?.at ?? null;
		return {
			...turned,
			...projectFields(item.project),
			itemId: item.id,
			revision: item.revision,
			baseline: snapshotOf(item.facts, ctx.me),
			retained,
			analysisStale: derived.analysis.stale,
			categories: knownCategories(derived.lenient),
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
		const usesRelativeDays =
			rulesUseRelativeDays || view.clauses.some((clause) => RELATIVE_DAY.test(clause.local));
		return minimum(
			[
				...rows.flatMap((row) => [stalesAt(row), snoozeEnds(row), retentionEnds(row)]),
				...sourceStaleEnds,
				usesRelativeDays ? nextDayStart(ctx.now) : null
			],
			ctx.now
		);
	}

	function evaluate(
		view: CompiledView,
		state: ViewState | null,
		found = membership(view)
	): ViewEvaluation {
		const retained = retainedIn(view, state, found.members);
		const rows = sortItems([
			...[...found.members].map((id) => rowOf(ctx.items.get(id)!, false)),
			...retained.map((id) => rowOf(ctx.items.get(id)!, true))
		]);
		return { membership: found, rows, nextBoundary: nextBoundary(view, rows) };
	}

	return { membership, evaluate, derive };
}
