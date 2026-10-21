import { matchesCategoryFilters, type CategoryFilter } from './categories';
import { closedSectionLabel, keepsClosed } from './closed-items';
import { groupWithClosed, type GroupContext } from './grouping';
import { sortItemsBy, sortOfView } from './sorting';
import type { CategoryGroup, DashItem, DashKind, ItemView } from './types';

export const inSavedView = (item: DashItem, view: ItemView) =>
	item.sections.includes(view.id) && (keepsClosed(view) || !item.keptAfterClose);

export const inViewPopulation = (item: DashItem, view: ItemView, showSnoozed = false) =>
	item.dismissed === showSnoozed && inSavedView(item, view);

export function viewPopulation(
	items: DashItem[],
	view: ItemView,
	categoryGroups: CategoryGroup[],
	categoryFilter: CategoryFilter[] = [],
	showSnoozed = false
): DashItem[] {
	return items.filter(
		(item) =>
			inViewPopulation(item, view, showSnoozed) &&
			matchesCategoryFilters(item.categories, categoryFilter, categoryGroups)
	);
}

export function savedViewSections(
	items: DashItem[],
	view: ItemView,
	context: GroupContext,
	kinds: DashKind[]
) {
	return groupWithClosed(
		sortItemsBy(items, sortOfView(view)),
		view.groupBy,
		{ ...context, sections: view.sections },
		closedSectionLabel(kinds)
	);
}
