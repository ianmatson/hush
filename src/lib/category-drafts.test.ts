import { describe, expect, it } from 'vitest';
import { newCategory, newCategoryGroup } from './category-drafts';
import { validateCategoryGroups } from './shared/categories';
import type { CategoryGroup } from './shared/types';

describe('category drafts', () => {
	it('names a new group with a name no other group has', () => {
		const groups: CategoryGroup[] = [{ id: 'g', name: 'New group', categories: [] }];
		const fresh = newCategoryGroup(groups);
		expect(fresh.name).toBe('New group 2');
		expect(fresh.categories).toEqual([]);
		expect(validateCategoryGroups([...groups, fresh])).toBeNull();
	});

	it('adds an empty category with a free name, which a save accepts', () => {
		const group: CategoryGroup = { id: 'g', name: 'Effort', categories: [] };
		group.categories = [newCategory(group)];
		group.categories = [...group.categories, newCategory(group)];
		expect(group.categories.map((c) => c.name)).toEqual(['New category', 'New category 2']);
		expect(group.categories[0]).toMatchObject({ color: 'blue', rule: '', description: '' });
		expect(validateCategoryGroups([group])).toBeNull();
	});
});
