import { afterEach, describe, expect, it, vi } from 'vitest';
import { boardShort, editProject, itemStatuses, readItemStatuses } from '../projects';

afterEach(() => vi.unstubAllGlobals());

describe('definitive board failures', () => {
	it.each([undefined, 'NOT_FOUND', 'FORBIDDEN'])(
		'does not carry a missing board with error type %s',
		async (type) => {
			vi.stubGlobal(
				'fetch',
				vi.fn(async () =>
					Response.json({
						data: { repositoryOwner: { projectV2: null } },
						...(type ? { errors: [{ type, message: 'Unavailable' }] } : {})
					})
				)
			);
			for (let attempt = 0; attempt < 2; attempt++) {
				const result = await boardShort('test', [
					{ section: 'website', q: 'project:acme/7 status:Todo' }
				]);
				expect(result.failedQueries).toEqual([]);
				expect(result.failedSections.has('website')).toBe(true);
			}
		}
	);
});

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

	it('marks membership as incomplete when GitHub did not name a project owner', () => {
		const { projects, statusOf, incomplete } = readItemStatuses([
			{
				id: 'PR_1',
				projectItems: { nodes: [{ project: board({ owner: {} }), fieldValueByName: null }] }
			}
		]);
		expect(projects).toEqual([]);
		expect(statusOf.get('PR_1')).toEqual({});
		expect(incomplete?.has('PR_1')).toBe(true);
	});

	it('does not treat a missing project connection as confirmed absence', () => {
		const { statusOf } = readItemStatuses([{ id: 'PR_1', projectItems: null }]);
		expect(statusOf.has('PR_1')).toBe(false);
	});
});

describe('itemStatuses', () => {
	it('keeps visible project memberships when a complete connection contains a hidden project', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				Response.json({
					data: {
						nodes: [
							{
								id: 'PR_1',
								projectItems: {
									pageInfo: { hasNextPage: false, endCursor: null },
									nodes: [
										{ project: board(), fieldValueByName: { optionId: 'doing' } },
										{ project: null, fieldValueByName: null }
									]
								}
							}
						]
					},
					errors: [
						{
							type: 'FORBIDDEN',
							message: 'Project hidden',
							path: ['nodes', 0, 'projectItems', 'nodes', 1, 'project']
						}
					]
				})
			)
		);
		const result = await itemStatuses('t', ['PR_1']);
		expect(result.statusOf.get('PR_1')).toEqual({ 'acme/7': 'doing' });
		expect(result.incomplete?.has('PR_1')).toBe(true);
		expect(result.errors).toEqual(['Project hidden']);
	});
	it('keeps successful nodes but discards membership with a GraphQL field error', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				Response.json({
					data: {
						nodes: [
							{ id: 'PR_1', projectItems: { nodes: [] } },
							{ id: 'I_2', projectItems: { nodes: [] } }
						]
					},
					errors: [{ message: 'Not allowed', path: ['nodes', 0, 'projectItems'] }]
				})
			)
		);
		const result = await itemStatuses('t', ['PR_1', 'I_2']);
		expect(result.statusOf.has('PR_1')).toBe(false);
		expect(result.statusOf.get('I_2')).toEqual({});
		expect(result.errors).toEqual(['Not allowed']);
	});

	it('reads all pages of membership before replacing the stored value', async () => {
		const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
			const { variables } = JSON.parse(String(init?.body));
			const first = variables.after === null;
			return Response.json({
				data: {
					nodes: [
						{
							id: 'PR_1',
							projectItems: {
								pageInfo: { hasNextPage: first, endCursor: first ? 'next' : null },
								nodes: [{ project: board({ number: first ? 7 : 9 }), fieldValueByName: null }]
							}
						}
					]
				}
			});
		});
		vi.stubGlobal('fetch', fetch);
		const result = await itemStatuses('t', ['PR_1']);
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(result.statusOf.get('PR_1')).toEqual({ 'acme/7': null, 'acme/9': null });
	});

	it('discards all pages for an item if a later membership page fails', async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({
					data: {
						nodes: [
							{
								id: 'PR_1',
								projectItems: {
									pageInfo: { hasNextPage: true, endCursor: 'next' },
									nodes: [{ project: board(), fieldValueByName: null }]
								}
							}
						]
					}
				})
			)
			.mockResolvedValueOnce(new Response('', { status: 502 }));
		vi.stubGlobal('fetch', fetch);
		const result = await itemStatuses('t', ['PR_1']);
		expect(result.statusOf.has('PR_1')).toBe(false);
		expect(result.errors).toEqual(['GitHub returned 502.']);
	});
});

describe('editProject', () => {
	const ADDED = { data: { addProjectV2ItemById: { item: { id: 'PVTI_new' } } } };
	const sentBodies = (fetchMock: ReturnType<typeof vi.fn>) =>
		fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));

	it('adds the item to the project that the user picked', async () => {
		const fetchMock = vi.fn(async () => Response.json(ADDED));
		vi.stubGlobal('fetch', fetchMock);
		const error = await editProject('test', {
			action: 'add',
			projectId: 'PVT_board',
			contentId: 'I_issue'
		});
		expect(error).toBeNull();
		const [body] = sentBodies(fetchMock);
		expect(body.query).toContain('addProjectV2ItemById');
		expect(body.variables).toEqual({ p: 'PVT_board', c: 'I_issue' });
	});

	it('reports when GitHub does not add the item', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ data: { addProjectV2ItemById: null } }))
		);
		const error = await editProject('test', {
			action: 'add',
			projectId: 'PVT_board',
			contentId: 'I_issue'
		});
		expect(error).toBe('GitHub did not add the item to the project.');
	});
});
