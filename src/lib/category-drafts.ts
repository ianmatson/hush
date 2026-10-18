import { randomId, unusedName } from '$lib/draft-edits';
import type { CategoryGroup, ItemCategory } from '$lib/shared/types';

export function newCategoryGroup(groups: readonly CategoryGroup[]): CategoryGroup {
	return {
		id: randomId('group'),
		name: unusedName(
			'New group',
			groups.map((g) => g.name)
		),
		categories: []
	};
}

export function newCategory(group: CategoryGroup): ItemCategory {
	return {
		id: randomId('category'),
		name: unusedName(
			'New category',
			group.categories.map((c) => c.name)
		),
		color: 'blue',
		rule: '',
		description: ''
	};
}
