import type { AssignableUser, ItemField, RepoLabel } from '../src/lib/shared/item-fields';
import {
	GitHubError,
	gh,
	githubStatusMessage,
	graphql,
	restWriteFailure,
	type WriteFailure
} from './github';

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const LABELS_PER_PAGE = 100;
const USERS_PER_SEARCH = 20;
const NOT_THERE = 404;

const LABELS = `query($o: String!, $r: String!, $q: String) {
  repository(owner: $o, name: $r) {
    labels(first: ${LABELS_PER_PAGE}, query: $q, orderBy: { field: NAME, direction: ASC }) {
      nodes { name color description }
    }
  }
}`;

const ASSIGNABLE = `query($o: String!, $r: String!, $q: String) {
  repository(owner: $o, name: $r) {
    assignableUsers(first: ${USERS_PER_SEARCH}, query: $q) { nodes { login name avatarUrl(size: 40) } }
  }
}`;

async function repositoryData(
	token: string,
	query: string,
	owner: string,
	repo: string,
	search: string
) {
	const { ok, status, data, errors } = await graphql<Json>(token, query, {
		o: owner,
		r: repo,
		q: search || null
	});
	if (!ok) throw new GitHubError(status, githubStatusMessage(status));
	if (!data?.repository && errors.length) throw new GitHubError(502, errors[0].message);
	return data?.repository ?? null;
}

export async function repoLabels(
	token: string,
	owner: string,
	repo: string,
	search: string
): Promise<RepoLabel[]> {
	const repository = await repositoryData(token, LABELS, owner, repo, search);
	return (repository?.labels?.nodes ?? []).map((l: Json) => ({
		name: l.name,
		color: l.color,
		description: l.description || null
	}));
}

export async function assignableUsers(
	token: string,
	owner: string,
	repo: string,
	search: string
): Promise<AssignableUser[]> {
	const repository = await repositoryData(token, ASSIGNABLE, owner, repo, search);
	return (repository?.assignableUsers?.nodes ?? []).map((u: Json) => ({
		login: u.login,
		name: u.name || null,
		avatar: u.avatarUrl ?? null
	}));
}

const call = (token: string, path: string, method: string, payload?: unknown) =>
	gh(token, path, {
		method,
		body: payload === undefined ? undefined : JSON.stringify(payload)
	}).catch(() => null);

async function failureOf(res: Response | null, allowMissing = false): Promise<WriteFailure | null> {
	if (res?.ok || (allowMissing && res?.status === NOT_THERE)) return null;
	return restWriteFailure(res);
}

async function editLabels(
	token: string,
	issuePath: string,
	add: string[],
	remove: string[]
): Promise<WriteFailure | null> {
	if (add.length) {
		const failure = await failureOf(
			await call(token, `${issuePath}/labels`, 'POST', { labels: add })
		);
		if (failure) return failure;
	}
	for (const name of remove) {
		const failure = await failureOf(
			await call(token, `${issuePath}/labels/${encodeURIComponent(name)}`, 'DELETE'),
			true
		);
		if (failure) return failure;
	}
	return null;
}

async function editAssignees(
	token: string,
	issuePath: string,
	add: string[],
	remove: string[]
): Promise<WriteFailure | null> {
	if (add.length) {
		const failure = await failureOf(
			await call(token, `${issuePath}/assignees`, 'POST', { assignees: add })
		);
		if (failure) return failure;
	}
	if (remove.length)
		return failureOf(await call(token, `${issuePath}/assignees`, 'DELETE', { assignees: remove }));
	return null;
}

export function editItemField(
	token: string,
	repo: string,
	number: number,
	field: ItemField,
	change: { add: string[]; remove: string[] }
): Promise<WriteFailure | null> {
	const issuePath = `/repos/${repo}/issues/${number}`;
	return field === 'labels'
		? editLabels(token, issuePath, change.add, change.remove)
		: editAssignees(token, issuePath, change.add, change.remove);
}
