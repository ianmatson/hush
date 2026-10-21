import { describe, expect, it } from 'vitest';
import { closedSectionLabel, keepsClosed } from './closed-items';
import { matchesCategoryFilters } from './categories';
import { groupWithClosed } from './grouping';
import { SORT_BY_ORDER, sortItemsBy, sortOfView } from './sorting';
import type { CategoryGroup, DashItem, GroupBy, ItemView, ViewSort } from './types';
import { inSavedView, savedViewSections, viewPopulation } from './view-projection';

const groups: CategoryGroup[] = [
	{
		id: 'effort',
		name: 'Effort',
		categories: [
			{ id: 'low', name: 'Low', color: 'green', rule: '', description: '' },
			{ id: 'high', name: 'High', color: 'red', rule: '', description: '' }
		]
	}
];
const view: ItemView = { id: 'mine', name: 'Mine', searches: ['repo:o/r'], groupBy: 'none' };
const context = {
	me: 'ian',
	categoryGroups: groups,
	projects: [
		{
			key: 'o/7',
			title: 'Board',
			url: 'https://github.com/orgs/o/projects/7',
			statuses: [{ id: 'todo', name: 'Todo', color: 'GRAY' }]
		}
	]
};
const item = (id: string, over: Partial<DashItem> = {}): DashItem =>
	({
		id,
		kind: 'pr',
		repo: 'o/r',
		title: id,
		author: 'alex',
		authorIsBot: false,
		labels: [],
		assignees: [],
		draft: false,
		state: 'open',
		reviewRequests: [],
		ci: 'SUCCESS',
		reviewDecision: null,
		reviewRequestCount: 0,
		reviewed: false,
		requestedMe: false,
		requestedTeams: [],
		myLastReviewAt: null,
		categories: [],
		sections: ['mine'],
		turn: 'them',
		turnReason: 'Waiting',
		priority: 1,
		waitingSince: '2026-10-20T00:00:00Z',
		updatedAt: '2026-10-21T00:00:00Z',
		createdAt: '2026-10-19T00:00:00Z',
		comments: 0,
		additions: 0,
		deletions: 0,
		dismissed: false,
		...over
	}) as DashItem;
const items = [
	item('z', {
		author: 'ian',
		categories: ['high'],
		pinnedCategories: ['high'],
		projectStatus: { 'o/7': 'todo' },
		comments: 1
	}),
	item('a', { requestedMe: true, categories: ['low'], turn: 'you', priority: 0, comments: 5 }),
	item('b', { kind: 'issue', assignees: ['ian'], labels: [{ name: 'bug', color: 'red' }] }),
	item('closed', { state: 'merged', keptAfterClose: true, closedAt: '2026-10-21T00:00:00Z' }),
	item('muted', { dismissed: true, muted: true }),
	item('other', { sections: ['other'] })
];
const shape = (v: ItemView) =>
	savedViewSections(viewPopulation(items, v, groups), v, context, ['pr', 'issue']).map((s) => [
		s.key,
		s.items.map((i) => i.id)
	]);

describe('shared saved view projection', () => {
	it('keeps exact membership, default hidden population, category filters, and closed preference', () => {
		expect(viewPopulation(items, view, groups).map((i) => i.id)).toEqual(['z', 'a', 'b', 'closed']);
		expect(viewPopulation(items, view, groups, [], true).map((i) => i.id)).toEqual(['muted']);
		expect(viewPopulation(items, view, groups, [{ category: 'high' }]).map((i) => i.id)).toEqual([
			'z'
		]);
		expect(
			viewPopulation(items, view, groups, [{ notSortedIn: 'effort' }]).map((i) => i.id)
		).toEqual(['b', 'closed']);
		expect(inSavedView(items[3], { ...view, keepClosed: false })).toBe(false);
	});

	it('uses saved category order, manual category placement, and the closed section', () => {
		expect(shape({ ...view, groupBy: 'category:effort' })).toEqual([
			['low', ['a']],
			['high', ['z']],
			['Not sorted', ['b']],
			['Merged and closed', ['closed']]
		]);
		expect(
			shape({ ...view, groupBy: 'custom', sections: [{ name: 'Opened', rule: 'author:ian' }] })
		).toEqual([
			['custom:Opened', ['z']],
			['Everything else', ['a', 'b']],
			['Merged and closed', ['closed']]
		]);
	});

	it('uses project status order and fallback groups', () => {
		expect(shape({ ...view, groupBy: 'project:o/7' })).toEqual([
			['status:todo', ['z']],
			['Not in project', ['a', 'b']],
			['Merged and closed', ['closed']]
		]);
	});

	it('matches the previous UI pipeline for every grouping, sort, direction, and turn-first setting', () => {
		const bys: GroupBy[] = [
			'none',
			'role',
			'status',
			'repo',
			'author',
			'label',
			'assignee',
			'custom',
			'category:effort',
			'project:o/7'
		];
		let comparisons = 0;
		for (const groupBy of bys)
			for (const by of SORT_BY_ORDER)
				for (const dir of ['asc', 'desc'] as const)
					for (const turnFirst of [true, false]) {
						const sort: ViewSort = { by, dir, turnFirst };
						const v = {
							...view,
							groupBy,
							sort,
							sections: [{ name: 'Opened', rule: 'author:ian' }]
						};
						const oldPopulation = items.filter(
							(i) =>
								i.dismissed === false &&
								i.sections.includes(v.id) &&
								(keepsClosed(v) || !i.keptAfterClose) &&
								matchesCategoryFilters(i.categories, [], groups)
						);
						const before = groupWithClosed(
							sortItemsBy(oldPopulation, sortOfView(v)),
							groupBy,
							{ ...context, sections: v.sections },
							closedSectionLabel(['pr', 'issue'])
						);
						expect(
							savedViewSections(viewPopulation(items, v, groups), v, context, ['pr', 'issue'])
						).toEqual(before);
						comparisons++;
					}
		expect(comparisons).toBe(280);
	});
});
