import { pinsAfter, type CategoryPin } from '../../src/lib/shared/categories';
import type { Snapshot } from '../../src/lib/shared/changes';
import { HOUR_MS } from '../../src/lib/shared/durations';
import { sameLogin } from '../../src/lib/shared/logins';
import type { ProjectAccess } from '../../src/lib/shared/projects';
import { factEvents, type PushFact } from '../../src/lib/shared/push-facts';
import { snoozeOutcome } from '../../src/lib/shared/snooze';
import { enrichmentOf, type SubjectFacts } from '../../src/lib/shared/subject';
import type { DashProject, Settings, TeamDTO } from '../../src/lib/shared/types';
import { compileViews } from '../../src/lib/model/compile';
import { attentionState, createEvaluator, snoozeIsOver } from '../../src/lib/model/evaluate';
import { applySourceRead, withSpec, type SourceRead } from '../../src/lib/model/sources';
import { transitionView, type TransitionCause } from '../../src/lib/model/transition';
import type {
	Analysis,
	Attention,
	CompiledView,
	Item,
	ItemId,
	ProjectFacet,
	Snooze,
	Source,
	ViewState
} from '../../src/lib/model/types';

export const NEW_ITEM_WINDOW_MS = HOUR_MS;

export interface Config {
	me: string;
	settings: Settings;
	teams: TeamDTO[];
	projectAccess: ProjectAccess;
	analysisVersion: string;
	projects: DashProject[];
}

export interface WorkspaceData {
	config: Config;
	items: ReadonlyMap<ItemId, Item>;
	sources: ReadonlyMap<string, Source>;
	views: ReadonlyMap<string, ViewState>;
	revision: number;
}

export type Observation =
	| { kind: 'items'; read: SubjectFacts[]; inaccessible: ItemId[]; quiet: boolean }
	| { kind: 'projects'; facets: [ItemId, ProjectFacet][]; definitions: DashProject[] }
	| { kind: 'analysis'; itemId: ItemId; analysis: Analysis }
	| { kind: 'source'; sourceId: string; read: SourceRead };

export type Command =
	| { kind: 'seen'; itemId: ItemId; revision: number; snapshot: Snapshot }
	| { kind: 'unread'; itemIds: ItemId[] }
	| { kind: 'snooze'; itemIds: ItemId[]; snooze: Snooze }
	| { kind: 'wake'; itemIds: ItemId[] }
	| { kind: 'mute'; itemIds: ItemId[]; muted: boolean }
	| { kind: 'pin'; itemIds: ItemId[]; pin: CategoryPin }
	| { kind: 'settings'; settings: Settings }
	| { kind: 'teams'; teams: TeamDTO[] }
	| { kind: 'forget'; itemIds: ItemId[] };

export type Input = Observation | Command | { kind: 'time' };

export type AlertReason = PushFact | 'new-item';

export interface AlertCause {
	id: string;
	itemId: ItemId;
	reasons: AlertReason[];
	title: string;
	body: string;
	url: string;
}

export interface Changes {
	items: Set<ItemId>;
	removedItems: Set<ItemId>;
	sources: Set<string>;
	removedSources: Set<string>;
	views: Set<string>;
	removedViews: Set<string>;
	config: boolean;
}

export interface CommitResult {
	data: WorkspaceData;
	changes: Changes;
	alerts: AlertCause[];
	changedViews: string[];
	departed: ItemId[];
	interest: Set<ItemId>;
	nextBoundary: number | null;
}

const COMMAND_KINDS = new Set<Input['kind']>([
	'seen',
	'unread',
	'snooze',
	'wake',
	'mute',
	'pin',
	'settings',
	'teams',
	'forget'
]);

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const olderThan = (incoming: SubjectFacts, stored: SubjectFacts | undefined) =>
	!!stored && Date.parse(incoming.updatedAt) < Date.parse(stored.updatedAt);

export const emptyAttention = (): Attention => ({
	seen: null,
	markedUnread: false,
	snooze: null,
	muted: false,
	pins: []
});

const newProjectFacet = (access: ProjectAccess): ProjectFacet =>
	access === 'none' ? { state: 'unavailable' } : { state: 'unknown' };

class Draft {
	readonly items: Map<ItemId, Item>;
	readonly sources: Map<string, Source>;
	config: Config;
	readonly changes: Changes = {
		items: new Set(),
		removedItems: new Set(),
		sources: new Set(),
		removedSources: new Set(),
		views: new Set(),
		removedViews: new Set(),
		config: false
	};
	readonly factsChanged = new Map<ItemId, SubjectFacts | null>();
	readonly quietItems = new Set<ItemId>();
	readonly closedNow = new Set<ItemId>();

	constructor(readonly before: WorkspaceData) {
		this.items = new Map(before.items);
		this.sources = new Map(before.sources);
		this.config = before.config;
	}

	putItem(item: Item) {
		this.items.set(item.id, item);
		this.changes.items.add(item.id);
		this.changes.removedItems.delete(item.id);
	}

	removeItem(id: ItemId) {
		if (!this.items.delete(id)) return;
		this.changes.removedItems.add(id);
		this.changes.items.delete(id);
	}

	putSource(source: Source) {
		this.sources.set(source.spec.id, source);
		this.changes.sources.add(source.spec.id);
	}

	updateAttention(ids: ItemId[], change: (attention: Attention, item: Item) => Attention) {
		for (const id of ids) {
			const item = this.items.get(id);
			if (!item) continue;
			const attention = change(item.attention, item);
			if (!sameJson(attention, item.attention)) this.putItem({ ...item, attention });
		}
	}
}

function applyFacts(draft: Draft, read: SubjectFacts[], inaccessible: ItemId[], quiet: boolean) {
	for (const facts of read) {
		const stored = draft.items.get(facts.id);
		if (olderThan(facts, stored?.facts) || sameJson(facts, stored?.facts)) continue;
		if (!draft.factsChanged.has(facts.id)) draft.factsChanged.set(facts.id, stored?.facts ?? null);
		if (quiet) draft.quietItems.add(facts.id);
		if (stored?.facts.state === 'open' && facts.state !== 'open') draft.closedNow.add(facts.id);
		draft.putItem(
			stored
				? { ...stored, facts, revision: stored.revision + 1 }
				: {
						id: facts.id,
						revision: 1,
						facts,
						project: newProjectFacet(draft.config.projectAccess),
						analysis: null,
						attention: emptyAttention()
					}
		);
	}
	for (const id of inaccessible) draft.removeItem(id);
}

function applyInput(draft: Draft, input: Input, now: number) {
	switch (input.kind) {
		case 'items':
			return applyFacts(draft, input.read, input.inaccessible, input.quiet);
		case 'projects': {
			for (const [id, project] of input.facets) {
				const item = draft.items.get(id);
				if (item && !sameJson(item.project, project)) draft.putItem({ ...item, project });
			}
			const byKey = new Map(draft.config.projects.map((project) => [project.key, project]));
			for (const definition of input.definitions) byKey.set(definition.key, definition);
			const projects = [...byKey.values()];
			if (!sameJson(projects, draft.config.projects)) {
				draft.config = { ...draft.config, projects };
				draft.changes.config = true;
			}
			return;
		}
		case 'analysis': {
			const item = draft.items.get(input.itemId);
			if (item && !sameJson(item.analysis, input.analysis))
				draft.putItem({ ...item, analysis: input.analysis });
			return;
		}
		case 'source': {
			const source = draft.sources.get(input.sourceId);
			if (source) draft.putSource(applySourceRead(source, input.read, now));
			return;
		}
		case 'seen':
			return draft.updateAttention([input.itemId], (attention) =>
				attention.seen && attention.seen.revision > input.revision
					? attention
					: {
							...attention,
							markedUnread: false,
							seen: { at: now, revision: input.revision, snapshot: input.snapshot }
						}
			);
		case 'unread':
			return draft.updateAttention(input.itemIds, (attention) => ({
				...attention,
				markedUnread: true
			}));
		case 'snooze':
			return draft.updateAttention(input.itemIds, (attention) => ({
				...attention,
				snooze: input.snooze
			}));
		case 'wake':
			return draft.updateAttention(input.itemIds, (attention) => ({ ...attention, snooze: null }));
		case 'mute':
			return draft.updateAttention(input.itemIds, (attention) => ({
				...attention,
				muted: input.muted
			}));
		case 'pin':
			return draft.updateAttention(input.itemIds, (attention) => ({
				...attention,
				pins:
					pinsAfter(attention.pins, input.pin, draft.config.settings.categoryGroups) ??
					attention.pins
			}));
		case 'settings':
			draft.config = { ...draft.config, settings: input.settings };
			draft.changes.config = true;
			return;
		case 'teams':
			draft.config = { ...draft.config, teams: input.teams };
			draft.changes.config = true;
			return;
		case 'forget':
			for (const id of input.itemIds) draft.removeItem(id);
			return;
		case 'time':
			return;
	}
}

function compileAndReconcile(draft: Draft, now: number): CompiledView[] {
	const { settings, teams, analysisVersion } = draft.config;
	const compiled = compileViews(settings.views, {
		dash: settings.dash,
		categoryGroups: settings.categoryGroups,
		smartDecisions: settings.smartDecisions,
		teams,
		analysisVersion,
		now
	});
	const wanted = new Set(compiled.sources.map((spec) => spec.id));
	for (const spec of compiled.sources) {
		const source = draft.sources.get(spec.id);
		if (!source || !sameJson(source.spec, spec)) draft.putSource(withSpec(source, spec));
	}
	for (const id of draft.sources.keys())
		if (!wanted.has(id)) {
			draft.sources.delete(id);
			draft.changes.removedSources.add(id);
			draft.changes.sources.delete(id);
		}
	return compiled.views;
}

interface SnoozeWake {
	itemId: ItemId;
	title: string | null;
}

function consumeFinishedSnoozes(draft: Draft, now: number): SnoozeWake[] {
	const wakes: SnoozeWake[] = [];
	const { me } = draft.config;
	for (const item of draft.items.values()) {
		const snooze = item.attention.snooze;
		if (!snooze || !snoozeIsOver(snooze, item.facts, me, now)) continue;
		draft.putItem({ ...item, attention: { ...item.attention, snooze: null } });
		if (snooze.kind !== 'event') continue;
		const outcome = snoozeOutcome(snooze.event, enrichmentOf(item.facts), snooze.at, me);
		wakes.push({
			itemId: item.id,
			title: outcome.wake ? `Snooze over: ${outcome.reason}` : 'Snooze over'
		});
	}
	return wakes;
}

const holdsAlerts = (item: Item, me: string, now: number) => {
	const state = attentionState(item.attention, item.facts, me, now);
	return (
		state.kind === 'muted' ||
		(state.kind === 'snoozed' && (!!state.choice.event || state.choice.until !== undefined))
	);
};

interface Admission {
	itemId: ItemId;
	viewName: string;
}

function alertCauses(
	draft: Draft,
	alertable: Set<ItemId>,
	admissions: Admission[],
	wakes: SnoozeWake[],
	now: number
): AlertCause[] {
	const { me, settings, teams } = draft.config;
	const wanted = new Set(settings.pushFacts);
	const myTeams = new Set(teams.map((team) => team.slug));
	const byItem = new Map<ItemId, { reasons: AlertReason[]; titles: string[] }>();
	const add = (itemId: ItemId, reason: AlertReason, title: string) => {
		const entry = byItem.get(itemId) ?? { reasons: [], titles: [] };
		if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
		entry.titles.push(title);
		byItem.set(itemId, entry);
	};
	for (const [id, before] of draft.factsChanged) {
		const item = draft.items.get(id);
		if (!item || draft.quietItems.has(id) || !alertable.has(id) || holdsAlerts(item, me, now))
			continue;
		for (const event of factEvents(before, item.facts, me, myTeams, now - NEW_ITEM_WINDOW_MS))
			if (wanted.has(event.fact)) add(id, event.fact, event.title);
	}
	if (wanted.has('snooze-over'))
		for (const wake of wakes) add(wake.itemId, 'snooze-over', wake.title ?? 'Snooze over');
	for (const admission of admissions) {
		const item = draft.items.get(admission.itemId);
		if (!item || sameLogin(item.facts.author, me) || holdsAlerts(item, me, now)) continue;
		add(admission.itemId, 'new-item', `New in ${admission.viewName}`);
	}
	return [...byItem].map(([itemId, { reasons, titles }]) => {
		const item = draft.items.get(itemId)!;
		return {
			id: `${itemId}@${item.revision}:${reasons.join('+')}`,
			itemId,
			reasons,
			title: [...new Set(titles)].join(' · '),
			body: `${item.facts.title}\n${item.facts.repo}`,
			url: item.facts.url
		};
	});
}

export function commit(before: WorkspaceData, input: Input | Input[], now: number): CommitResult {
	const inputs = Array.isArray(input) ? input : [input];
	const draft = new Draft(before);
	for (const each of inputs) applyInput(draft, each, now);
	const views = compileAndReconcile(draft, now);
	const wakes = consumeFinishedSnoozes(draft, now);
	const { me, settings, teams, analysisVersion } = draft.config;
	const evaluation = {
		me,
		dash: settings.dash,
		categoryGroups: settings.categoryGroups,
		smartDecisions: settings.smartDecisions,
		teams,
		analysisVersion,
		now,
		items: draft.items,
		sources: draft.sources
	};
	const evaluator = createEvaluator(evaluation);
	const cause: TransitionCause = inputs.every((each) => COMMAND_KINDS.has(each.kind))
		? 'command'
		: 'observation';
	const nextViews = new Map<string, ViewState>();
	const alertable = new Set<ItemId>();
	const admissions: Admission[] = [];
	const departed = new Set<ItemId>();
	const interest = new Set<ItemId>();
	const changedViews: string[] = [];
	let nextBoundary: number | null = null;
	for (const view of views) {
		const stored = before.views.get(view.view.id) ?? null;
		const found = evaluator.membership(view);
		const transition = transitionView(
			view,
			stored,
			found,
			{ ...evaluation, closedNow: draft.closedNow },
			cause
		);
		nextViews.set(view.view.id, transition.state);
		if (!sameJson(stored, transition.state)) draft.changes.views.add(view.view.id);
		for (const id of transition.alertable) alertable.add(id);
		for (const id of transition.departed) departed.add(id);
		for (const id of [...found.candidates, ...transition.state.retained]) interest.add(id);
		if (view.view.pushNew)
			for (const itemId of transition.admitted)
				admissions.push({ itemId, viewName: view.view.name });
		const touched = [...transition.state.members, ...transition.state.retained].some((id) =>
			draft.changes.items.has(id)
		);
		if (touched || draft.changes.views.has(view.view.id) || draft.changes.config)
			changedViews.push(view.view.id);
		const boundary = evaluator.evaluate(view, transition.state).nextBoundary;
		if (boundary !== null && (nextBoundary === null || boundary < nextBoundary))
			nextBoundary = boundary;
	}
	for (const id of before.views.keys()) if (!nextViews.has(id)) draft.changes.removedViews.add(id);
	const alerts = alertCauses(draft, alertable, admissions, wakes, now);
	const changed =
		draft.changes.items.size +
			draft.changes.removedItems.size +
			draft.changes.sources.size +
			draft.changes.removedSources.size +
			draft.changes.views.size +
			draft.changes.removedViews.size >
			0 || draft.changes.config;
	return {
		data: {
			config: draft.config,
			items: draft.items,
			sources: draft.sources,
			views: nextViews,
			revision: changed ? before.revision + 1 : before.revision
		},
		changes: draft.changes,
		alerts,
		changedViews,
		departed: [...departed],
		interest,
		nextBoundary
	};
}
