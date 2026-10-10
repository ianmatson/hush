import { describe, expect, it } from 'vitest';
import {
	categoryGroupBy,
	groupByLabel,
	groupByOk,
	groupByOptions,
	groupItems,
	NO_STATUS_SECTION,
	NOT_IN_PROJECT_SECTION,
	NOT_SORTED_SECTION,
	projectGroupBy,
	projectsHolding
} from './grouping';
import type { CategoryGroup, DashItem, DashProject } from './types';

const ME = 'ian';

const item = (id: string, over: Partial<DashItem> = {}): DashItem =>
	({
		id,
		kind: 'pr',
		repo: 'acme/web',
		author: 'alice',
		labels: [],
		assignees: [],
		draft: false,
		reviewDecision: null,
		reviewRequestCount: 0,
		reviewed: false,
		requestedMe: false,
		requestedTeams: [],
		myLastReviewAt: null,
		categories: [],
		...over
	}) as DashItem;

const EFFORT: CategoryGroup = {
	id: 'effort',
	name: 'Effort',
	categories: [
		{ id: 'low', name: 'Low', color: 'green', rule: '', description: 'a' },
		{ id: 'high', name: 'High', color: 'red', rule: '', description: 'b' }
	]
};

const BOARD: DashProject = {
	key: 'acme/7',
	title: 'Website',
	url: 'https://github.com/orgs/acme/projects/7',
	statuses: [
		{ id: 'todo', name: 'Todo', color: 'GRAY' },
		{ id: 'doing', name: 'In progress', color: 'YELLOW' },
		{ id: 'done', name: 'Done', color: 'GREEN' }
	]
};

const ctx = { me: ME, categoryGroups: [EFFORT], projects: [BOARD] };
const shape = (items: DashItem[], by: Parameters<typeof groupItems>[1]) =>
	groupItems(items, by, ctx).map((s) => [s.label, s.items.map((i) => i.id)]);

describe('groupItems', () => {
	it('gives one flat list with None', () => {
		expect(shape([item('a'), item('b')], 'none')).toEqual([['', ['a', 'b']]]);
		expect(groupItems([], 'none', ctx)).toEqual([]);
	});

	it('groups by your role, in a fixed order, keeping the list order inside', () => {
		const items = [
			item('involved'),
			item('assigned', { kind: 'issue', assignees: ['Ian'] }),
			item('review', { requestedMe: true }),
			item('team', { requestedTeams: ['acme/web'] }),
			item('reviewed', { myLastReviewAt: '2026-10-01T00:00:00Z' }),
			item('mine', { author: 'IAN', requestedMe: true })
		];
		expect(shape(items, 'role')).toEqual([
			['You opened', ['mine']],
			['Reviews', ['review', 'team', 'reviewed']],
			['Assigned to you', ['assigned']],
			['Involved', ['involved']]
		]);
	});

	it('groups pull requests by review status, and issues by assignee', () => {
		const items = [
			item('draft', { draft: true, reviewDecision: 'APPROVED' }),
			item('approved', { reviewDecision: 'APPROVED' }),
			item('changes', { reviewDecision: 'CHANGES_REQUESTED' }),
			item('requested', { reviewRequestCount: 2 }),
			item('reviewed', { reviewed: true }),
			item('fresh'),
			item('open-issue', { kind: 'issue' }),
			item('taken-issue', { kind: 'issue', assignees: ['bob'] })
		];
		expect(shape(items, 'status')).toEqual([
			['No review yet', ['fresh']],
			['In review', ['requested', 'reviewed']],
			['Changes requested', ['changes']],
			['Approved', ['approved']],
			['Drafts', ['draft']],
			['Unassigned', ['open-issue']],
			['Assigned', ['taken-issue']]
		]);
	});

	it('groups by a field, one section for each value, sorted by name', () => {
		const items = [item('a', { repo: 'acme/web' }), item('b', { repo: 'Acme/api' })];
		expect(shape(items, 'repo')).toEqual([
			['Acme/api', ['b']],
			['acme/web', ['a']]
		]);
		expect(shape([item('a', { author: 'bob' }), item('b')], 'author')).toEqual([
			['alice', ['b']],
			['bob', ['a']]
		]);
	});

	it('puts an item with several labels or assignees in one section for the whole set', () => {
		const items = [
			item('two', {
				labels: [
					{ name: 'docs', color: '' },
					{ name: 'bug', color: '' }
				]
			}),
			item('none'),
			item('one', { assignees: ['bob'] })
		];
		expect(shape(items, 'label')).toEqual([
			['bug, docs', ['two']],
			['No labels', ['none', 'one']]
		]);
		expect(
			shape([item('none'), item('a', { labels: [{ name: 'zebra', color: '' }] })], 'label')
		).toEqual([
			['zebra', ['a']],
			['No labels', ['none']]
		]);
		expect(shape(items, 'assignee')).toEqual([
			['bob', ['one']],
			['No assignee', ['two', 'none']]
		]);
	});

	it('groups by a category group, with Not sorted last', () => {
		const items = [
			item('high', { categories: ['high'] }),
			item('none'),
			item('low', { categories: ['low', 'other'] })
		];
		expect(shape(items, categoryGroupBy('effort'))).toEqual([
			['Low', ['low']],
			['High', ['high']],
			[NOT_SORTED_SECTION, ['none']]
		]);
	});

	it('falls back to status when the category group is gone', () => {
		expect(shape([item('a')], categoryGroupBy('gone'))).toEqual([['No review yet', ['a']]]);
	});

	it('groups by project status in board order, then No status, then Not in project', () => {
		const items = [
			item('done', { projectStatus: { 'acme/7': 'done' } }),
			item('elsewhere', { projectStatus: { 'acme/9': 'todo' } }),
			item('todo', { projectStatus: { 'acme/7': 'todo', 'acme/9': 'done' } }),
			item('blank', { projectStatus: { 'acme/7': null } }),
			item('renamed', { projectStatus: { 'acme/7': 'gone-option' } }),
			item('unknown')
		];
		expect(shape(items, projectGroupBy('acme/7'))).toEqual([
			['Todo', ['todo']],
			['Done', ['done']],
			[NO_STATUS_SECTION, ['blank', 'renamed']],
			[NOT_IN_PROJECT_SECTION, ['elsewhere', 'unknown']]
		]);
		expect(groupItems(items, projectGroupBy('acme/7'), ctx)[0].color).toBe('GRAY');
	});

	it('puts every item outside a project that holds none of them', () => {
		expect(shape([item('a')], projectGroupBy('acme/1'))).toEqual([[NOT_IN_PROJECT_SECTION, ['a']]]);
	});

	it('falls back to status when Hush cannot read projects', () => {
		expect(
			groupItems([item('a')], projectGroupBy('acme/7'), { me: ME, categoryGroups: [] }).map(
				(s) => s.label
			)
		).toEqual(['No review yet']);
	});
});

describe('Group by choices', () => {
	it('list None, role, status, the fields, the category groups, then the projects', () => {
		expect(
			groupByOptions([EFFORT, { id: 'empty', name: 'Empty', categories: [] }], [BOARD])
		).toEqual([
			{ id: 'none', label: 'None', kind: 'basic' },
			{ id: 'role', label: 'Your role', kind: 'basic' },
			{ id: 'status', label: 'Status', kind: 'basic' },
			{ id: 'repo', label: 'Repository', kind: 'field' },
			{ id: 'author', label: 'Author', kind: 'field' },
			{ id: 'label', label: 'Label', kind: 'field' },
			{ id: 'assignee', label: 'Assignee', kind: 'field' },
			{ id: 'category:effort', label: 'Effort', kind: 'category' },
			{ id: 'project:acme/7', label: 'Website status', kind: 'project' }
		]);
		expect(groupByLabel('category:effort', [EFFORT])).toBe('Effort');
		expect(groupByLabel('project:acme/7', [], [BOARD])).toBe('Website status');
		expect(groupByLabel('project:acme/1', [], [BOARD])).toBe('acme/1 status');
	});

	it('offer the projects that hold items, most items first, and the chosen one', () => {
		const other: DashProject = { ...BOARD, key: 'acme/9', title: 'Docs' };
		const empty: DashProject = { ...BOARD, key: 'acme/3', title: 'Empty' };
		const items = [
			item('a', { projectStatus: { 'acme/9': null } }),
			item('b', { projectStatus: { 'acme/9': 'todo', 'acme/7': 'todo' } })
		];
		const keys = (by: Parameters<typeof projectsHolding>[2]) =>
			projectsHolding(items, [BOARD, other, empty], by).map((p) => p.key);
		expect(keys('role')).toEqual(['acme/9', 'acme/7']);
		expect(keys(projectGroupBy('acme/3'))).toEqual(['acme/9', 'acme/7', 'acme/3']);
	});

	it('accept only known values', () => {
		for (const ok of [
			'none',
			'role',
			'status',
			'repo',
			'label',
			'category:effort',
			'project:PostHog/12',
			'project:my-org/1'
		])
			expect(groupByOk(ok)).toBe(true);
		for (const bad of [
			'',
			'turn',
			'category:',
			'category:Bad Id',
			'project:',
			'project:acme',
			'project:acme/0',
			'project:acme/x',
			'project:a b/1',
			3,
			null
		])
			expect(groupByOk(bad)).toBe(false);
	});
});
