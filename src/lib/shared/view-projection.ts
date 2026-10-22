import { matchesCategoryFilters, type CategoryFilter } from './categories';
import { closedSectionLabel, keepsClosed } from './closed-items';
import { groupWithClosed, type GroupContext } from './grouping';
import { sortItemsBy, sortOfView } from './sorting';
import type { CategoryGroup, DashItem, DashKind, ItemView } from './types';

export const inSavedView = (item: DashItem, view: ItemView) =>
	item.views.includes(view.id) || (keepsClosed(view) && item.retainedIn.includes(view.id));

export const inViewPopulation = (item: DashItem, view: ItemView, showSnoozed = false) =>
	item.dismissed === showSnoozed && inSavedView(item, view);

export const asSeenIn = (item: DashItem, view: ItemView): DashItem => ({
	...item,
	retained: !item.views.includes(view.id)
});

export function viewPopulation(
	items: DashItem[],
	view: ItemView,
	categoryGroups: CategoryGroup[],
	categoryFilter: CategoryFilter[] = [],
	showSnoozed = false
): DashItem[] {
	return items
		.filter(
			(item) =>
				inViewPopulation(item, view, showSnoozed) &&
				matchesCategoryFilters(item.categories, categoryFilter, categoryGroups)
		)
		.map((item) => asSeenIn(item, view));
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
