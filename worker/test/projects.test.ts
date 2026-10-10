import { describe, expect, it } from 'vitest';
import { readItemStatuses } from '../projects';

const board = (over: Record<string, unknown> = {}) => ({
	number: 7,
	title: 'Website',
	url: 'https://github.com/orgs/acme/projects/7',
	closed: false,
	owner: { login: 'acme' },
	field: {
		options: [
			{ id: 'todo', name: 'Todo', color: 'GRAY' },
			{ id: 'doing', name: 'In progress', color: 'YELLOW' }
		]
	},
	...over
});

describe('readItemStatuses', () => {
	it('reads the Status of each item in each open project', () => {
		const { projects, statusOf } = readItemStatuses([
			{
				id: 'PR_1',
				projectItems: {
					nodes: [
						{ project: board(), fieldValueByName: { optionId: 'doing' } },
						{ project: board({ number: 8, title: 'Old', closed: true }), fieldValueByName: null }
					]
				}
			},
			{ id: 'I_2', projectItems: { nodes: [{ project: board(), fieldValueByName: null }] } },
			{ id: 'I_3', projectItems: { nodes: [] } },
			null
		]);
		expect(projects).toEqual([
			{
				key: 'acme/7',
				title: 'Website',
				url: 'https://github.com/orgs/acme/projects/7',
				statuses: [
					{ id: 'todo', name: 'Todo', color: 'GRAY' },
					{ id: 'doing', name: 'In progress', color: 'YELLOW' }
				]
			}
		]);
		expect(Object.fromEntries(statusOf)).toEqual({
			PR_1: { 'acme/7': 'doing' },
			I_2: { 'acme/7': null },
			I_3: {}
		});
	});

	it('skips a project that GitHub did not name an owner for', () => {
		const { projects, statusOf } = readItemStatuses([
			{
				id: 'PR_1',
				projectItems: { nodes: [{ project: board({ owner: {} }), fieldValueByName: null }] }
			}
		]);
		expect(projects).toEqual([]);
		expect(statusOf.get('PR_1')).toEqual({});
	});
});
