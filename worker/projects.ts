import type { ExpandedQuery } from '../src/lib/shared/dashboard';
import {
	boardQueryOf,
	lacksProjectScope,
	PROJECT_ACCESS_NEEDED,
	type BoardQuery,
	type ProjectEdit,
	type ProjectItemDTO,
	type ProjectRef,
	type ProjectsDTO,
	type ProjectAccess
} from '../src/lib/shared/projects';
import { SOURCE_RESULTS_MAX } from '../src/lib/shared/item-views';
import type { DashProject } from '../src/lib/shared/types';
import { gh, type SearchHit } from './github';

type Node = Record<string, any>;

interface GraphqlAnswer {
	data: Node | null;
	errors: string[];
}

async function graphql(
	token: string,
	query: string,
	variables: Record<string, unknown>
): Promise<GraphqlAnswer> {
	const res = await gh(token, '/graphql', {
		method: 'POST',
		body: JSON.stringify({ query, variables })
	}).catch(() => null);
	if (!res) return { data: null, errors: ['GitHub did not answer. Hush tries again later.'] };
	const json = (await res.json().catch(() => null)) as {
		data?: Node;
		errors?: { message: string }[];
	} | null;
	const errors = (json?.errors ?? []).map((e) => e.message);
	if (!res.ok && !errors.length) errors.push(`GitHub returned ${res.status}.`);
	return { data: json?.data ?? null, errors };
}

const friendly = (errors: string[]) =>
	errors.map((e) => (lacksProjectScope(e) ? PROJECT_ACCESS_NEEDED : e));

const BOARD_ITEMS = `query($o: String!, $n: Int!, $f: String!, $first: Int!) {
  repositoryOwner(login: $o) { ... on ProjectV2Owner { projectV2(number: $n) {
    items(first: $first, query: $f) { totalCount nodes { content { __typename
      ... on PullRequest { id number updatedAt repository { nameWithOwner } }
      ... on Issue { id number updatedAt repository { nameWithOwner } }
    } } }
  } } }
}`;

const boardOf = (data: Node | null) => data?.repositoryOwner?.projectV2 ?? null;
const notFound = (board: BoardQuery) =>
	`GitHub did not find the project ${board.owner}/${board.number}, or Hush cannot see it.`;

export async function boardShort(
	token: string,
	queries: ExpandedQuery[]
): Promise<{ hits: SearchHit[]; errors: string[] }> {
	const hits: SearchHit[] = [];
	const errors: string[] = [];
	await Promise.all(
		queries.map(async (query) => {
			const board = boardQueryOf(query.q);
			if (!board) return;
			const answer = await graphql(token, BOARD_ITEMS, {
				o: board.owner,
				n: board.number,
				f: board.filter,
				first: SOURCE_RESULTS_MAX
			});
			errors.push(...friendly(answer.errors));
			const project = boardOf(answer.data);
			if (!project) {
				if (!answer.errors.length) errors.push(notFound(board));
				return;
			}
			for (const item of project.items?.nodes ?? []) {
				const n = item?.content;
				if (n?.id && n.repository?.nameWithOwner)
					hits.push({
						query,
						id: n.id,
						key: `${n.repository.nameWithOwner}#${n.number}`,
						updatedAt: n.updatedAt
					});
			}
		})
	);
	return { hits, errors: [...new Set(errors)].slice(0, 3) };
}

export async function boardCount(token: string, query: string): Promise<number | null> {
	const board = boardQueryOf(query);
	if (!board) return null;
	const answer = await graphql(token, BOARD_ITEMS, {
		o: board.owner,
		n: board.number,
		f: board.filter,
		first: 0
	});
	const project = boardOf(answer.data);
	if (project) return project.items?.totalCount ?? null;
	throw new Error(friendly(answer.errors)[0] ?? notFound(board));
}

const STATUSES_CHUNK = 50;

const ITEM_STATUSES = `query($ids: [ID!]!) { nodes(ids: $ids) {
  ... on PullRequest { id projectItems(first: 10, includeArchived: false) { nodes { ...Status } } }
  ... on Issue { id projectItems(first: 10, includeArchived: false) { nodes { ...Status } } }
} }
fragment Status on ProjectV2Item {
  project { number title url closed
    owner { ... on Organization { login } ... on User { login } }
    field(name: "Status") { ... on ProjectV2SingleSelectField { options { id name color } } }
  }
  fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { optionId } }
}`;

export interface ItemStatuses {
	projects: DashProject[];
	statusOf: Map<string, Record<string, string | null>>;
}

export function readItemStatuses(nodes: (Node | null)[]): ItemStatuses {
	const projects = new Map<string, DashProject>();
	const statusOf = new Map<string, Record<string, string | null>>();
	for (const n of nodes) {
		if (!n?.id) continue;
		const statuses: Record<string, string | null> = {};
		for (const item of n.projectItems?.nodes ?? []) {
			const p = item?.project;
			const owner = p?.owner?.login;
			if (!p || p.closed || !owner || !p.number) continue;
			const key = `${owner}/${p.number}`;
			statuses[key] = item.fieldValueByName?.optionId ?? null;
			if (!projects.has(key))
				projects.set(key, {
					key,
					title: p.title ?? key,
					url: p.url ?? '',
					statuses: (p.field?.options ?? []).map((o: Node) => ({
						id: o.id,
						name: o.name ?? '',
						color: o.color ?? 'GRAY'
					}))
				});
		}
		statusOf.set(n.id, statuses);
	}
	return { projects: [...projects.values()], statusOf };
}

export async function itemStatuses(
	token: string,
	ids: string[]
): Promise<ItemStatuses & { errors: string[] }> {
	const nodes: (Node | null)[] = [];
	const errors: string[] = [];
	for (let i = 0; i < ids.length; i += STATUSES_CHUNK) {
		const answer = await graphql(token, ITEM_STATUSES, { ids: ids.slice(i, i + STATUSES_CHUNK) });
		errors.push(...friendly(answer.errors));
		nodes.push(...((answer.data?.nodes as (Node | null)[] | undefined) ?? []));
	}
	return { ...readItemStatuses(nodes), errors: [...new Set(errors)].slice(0, 3) };
}

const PROJECT_FIELDS = 'id number title url closed';

const ITEMS_OF = `query($o: String!, $r: String!, $n: Int!) {
  repository(owner: $o, name: $r) { issueOrPullRequest(number: $n) {
    ... on Issue { id projectItems(first: 10, includeArchived: false) { nodes { ...Item } } }
    ... on PullRequest { id projectItems(first: 10, includeArchived: false) { nodes { ...Item } } }
  } }
  repositoryOwner(login: $o) { ... on ProjectV2Owner {
    projectsV2(first: 20, orderBy: { field: UPDATED_AT, direction: DESC }) { nodes { ${PROJECT_FIELDS} } }
  } }
}
fragment Item on ProjectV2Item {
  id
  project { ${PROJECT_FIELDS}
    field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name color } } }
  }
  fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { optionId } }
}`;

const toProject = (p: Node): ProjectRef => ({
	id: p.id,
	number: p.number,
	title: p.title ?? '',
	url: p.url
});

function toItem(n: Node): ProjectItemDTO {
	const field = n.project?.field;
	return {
		id: n.id,
		project: toProject(n.project),
		status: field?.id
			? {
					fieldId: field.id,
					optionId: n.fieldValueByName?.optionId ?? null,
					options: (field.options ?? []).map((o: Node) => ({
						id: o.id,
						name: o.name ?? '',
						color: o.color ?? 'GRAY'
					}))
				}
			: null
	};
}

export async function projectsOf(
	token: string,
	access: ProjectAccess,
	owner: string,
	repo: string,
	number: number
): Promise<ProjectsDTO> {
	const none: ProjectsDTO = { access, contentId: null, items: [], others: [] };
	if (access === 'none') return none;
	const answer = await graphql(token, ITEMS_OF, { o: owner, r: repo, n: number });
	const subject = answer.data?.repository?.issueOrPullRequest;
	if (!subject?.id) {
		if (answer.errors.length) throw new Error(friendly(answer.errors)[0]);
		return none;
	}
	const items = (subject.projectItems?.nodes ?? [])
		.filter((n: Node | null) => n?.id && n.project?.id && !n.project.closed)
		.map(toItem);
	const inProjects = new Set(items.map((i: ProjectItemDTO) => i.project.id));
	const others = (answer.data?.repositoryOwner?.projectsV2?.nodes ?? [])
		.filter((p: Node | null) => p?.id && !p.closed && !inProjects.has(p.id))
		.map(toProject);
	return { access, contentId: subject.id, items, others };
}

const SET_STATUS = `mutation($p: ID!, $i: ID!, $f: ID!, $o: String!) {
  updateProjectV2ItemFieldValue(input: { projectId: $p, itemId: $i, fieldId: $f, value: { singleSelectOptionId: $o } }) { clientMutationId }
}`;
const CLEAR_STATUS = `mutation($p: ID!, $i: ID!, $f: ID!) {
  clearProjectV2ItemFieldValue(input: { projectId: $p, itemId: $i, fieldId: $f }) { clientMutationId }
}`;
const REMOVE_ITEM = `mutation($p: ID!, $i: ID!) {
  deleteProjectV2Item(input: { projectId: $p, itemId: $i }) { deletedItemId }
}`;
const ADD_ITEM = `mutation($p: ID!, $c: ID!) {
  addProjectV2ItemById(input: { projectId: $p, contentId: $c }) { item { id } }
}`;

export async function editProject(token: string, edit: ProjectEdit): Promise<string | null> {
	const first = (answer: GraphqlAnswer) => friendly(answer.errors)[0] ?? null;
	switch (edit.action) {
		case 'status':
			return first(
				edit.optionId
					? await graphql(token, SET_STATUS, {
							p: edit.projectId,
							i: edit.itemId,
							f: edit.fieldId,
							o: edit.optionId
						})
					: await graphql(token, CLEAR_STATUS, {
							p: edit.projectId,
							i: edit.itemId,
							f: edit.fieldId
						})
			);
		case 'remove':
			return first(await graphql(token, REMOVE_ITEM, { p: edit.projectId, i: edit.itemId }));
		case 'move': {
			const added = await graphql(token, ADD_ITEM, { p: edit.toProjectId, c: edit.contentId });
			if (added.errors.length || !added.data?.addProjectV2ItemById?.item?.id)
				return first(added) ?? 'GitHub did not add the item to the project.';
			return first(await graphql(token, REMOVE_ITEM, { p: edit.projectId, i: edit.itemId }));
		}
	}
}
