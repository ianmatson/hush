import { describe, expect, it } from 'vitest';
import {
	categoryGroupBy,
	groupByLabel,
	groupByOk,
	groupByOptions,
	groupItems,
	NOT_SORTED_SECTION
} from './grouping';
import type { CategoryGroup, DashItem } from './types';

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

const ctx = { me: ME, categoryGroups: [EFFORT] };
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
});

describe('Group by choices', () => {
	it('list None, role, status, the fields, then the category groups', () => {
		expect(groupByOptions([EFFORT, { id: 'empty', name: 'Empty', categories: [] }])).toEqual([
			{ id: 'none', label: 'None' },
			{ id: 'role', label: 'Your role' },
			{ id: 'status', label: 'Status' },
			{ id: 'repo', label: 'Repository' },
			{ id: 'author', label: 'Author' },
			{ id: 'label', label: 'Label' },
			{ id: 'assignee', label: 'Assignee' },
			{ id: 'category:effort', label: 'Effort' }
		]);
		expect(groupByLabel('category:effort', [EFFORT])).toBe('Effort');
	});

	it('accept only known values', () => {
		for (const ok of ['none', 'role', 'status', 'repo', 'label', 'category:effort'])
			expect(groupByOk(ok)).toBe(true);
		for (const bad of ['', 'turn', 'category:', 'category:Bad Id', 3, null])
			expect(groupByOk(bad)).toBe(false);
	});
});
