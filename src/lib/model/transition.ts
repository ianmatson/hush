import { stillKept } from '../shared/closed-items';
import { usableWindow } from './sources';
import type { CompiledView, Item, ItemId, Membership, Source, ViewState } from './types';

export type TransitionCause = 'observation' | 'command';

export interface TransitionContext {
	items: ReadonlyMap<ItemId, Item>;
	sources: ReadonlyMap<string, Source>;
	closedNow: ReadonlySet<ItemId>;
	freshSources: ReadonlySet<string>;
	now: number;
}

export interface ViewTransition {
	state: ViewState;
	quiet: Set<ItemId>;
	admitted: ItemId[];
	alertable: Set<ItemId>;
}

export const emptyViewState = (scope: string): ViewState => ({
	scope,
	members: [],
	retained: [],
	seededBindings: [],
	baseline: [],
	awaitingRefresh: []
});

function seed(view: CompiledView, previous: ViewState, found: Membership, ctx: TransitionContext) {
	const bindings = new Set(view.clauses.map((clause) => clause.binding));
	const stillSeeded = previous.seededBindings.filter(
		(binding) => bindings.has(binding) && found.validBindings.has(binding)
	);
	const seeded = new Set(stillSeeded);
	const baseline = new Set(previous.baseline);
	const awaiting = new Set(previous.awaitingRefresh.filter((binding) => bindings.has(binding)));
	for (const clause of view.clauses) {
		if (seeded.has(clause.binding) || !found.validBindings.has(clause.binding)) continue;
		if (awaiting.has(clause.binding) && !ctx.freshSources.has(clause.sourceId)) continue;
		awaiting.delete(clause.binding);
		seeded.add(clause.binding);
		const window = usableWindow(ctx.sources.get(clause.sourceId), ctx.now);
		for (const candidate of window?.candidates ?? []) baseline.add(candidate.id);
	}
	const acceptedWhere = (keep: (binding: string) => boolean) =>
		new Set(
			[...found.acceptedBy]
				.filter(([binding]) => keep(binding))
				.flatMap(([, accepted]) => [...accepted])
		);
	const settled = acceptedWhere((binding) => !awaiting.has(binding));
	const awaitingOnly = new Set(
		[...acceptedWhere((binding) => awaiting.has(binding))].filter((id) => !settled.has(id))
	);
	return { seeded, baseline, awaiting, awaitingOnly };
}

function retain(view: CompiledView, previous: ViewState, ctx: TransitionContext): ItemId[] {
	if (view.view.keepClosed === false) return [];
	const closedAndKept = (id: ItemId) => {
		const item = ctx.items.get(id);
		return !!item && item.facts.state !== 'open' && stillKept(item.facts, ctx.now);
	};
	const justClosed = previous.members.filter((id) => ctx.closedNow.has(id));
	return [...new Set([...previous.retained, ...justClosed])].filter(closedAndKept);
}

export function transitionView(
	view: CompiledView,
	stored: ViewState | null,
	found: Membership,
	ctx: TransitionContext,
	cause: TransitionCause
): ViewTransition {
	const previous = stored?.scope === view.scope ? stored : emptyViewState(view.scope);
	const { seeded, baseline, awaiting, awaitingOnly } = seed(view, previous, found, ctx);
	const before = new Set(previous.members);
	const members = found.members;
	const admitted =
		cause === 'command'
			? []
			: [...members].filter((id) => !before.has(id) && !baseline.has(id) && !awaitingOnly.has(id));
	const retained = retain(view, previous, ctx);
	return {
		state: {
			scope: view.scope,
			members: [...members],
			retained,
			seededBindings: [...seeded],
			baseline: [...baseline].filter((id) => found.candidates.has(id) && found.unsettled.has(id)),
			awaitingRefresh: [...awaiting]
		},
		admitted,
		quiet: new Set([...baseline, ...awaitingOnly]),
		alertable: new Set([...before, ...members, ...retained])
	};
}
