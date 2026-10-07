import type { MergeMethod, PeekStack } from '../src/lib/shared/types';
import { gh } from './github';

const MAX_LEVELS_ABOVE = 10;
const ASYNC_MERGE_POLLS = 8;
const ASYNC_MERGE_POLL_MS = 1000;

export interface PrRefs {
	number: number;
	head: string;
	base: string;
	defaultBranch: string;
}

type GitHubStack = {
	number: number;
	pull_requests: { number: number; state: string; merged_at: string | null }[];
};

type AsyncMergeResult = { status?: string; details?: { message?: string; uuid?: string } };

const json = (payload: unknown): RequestInit => ({
	method: 'POST',
	body: JSON.stringify(payload)
});

async function graphql<T>(token: string, query: string, variables: Record<string, unknown>) {
	const res = await gh(token, '/graphql', json({ query, variables }));
	const body = (await res.json().catch(() => ({}))) as {
		data?: T;
		errors?: { message: string }[];
	};
	if (!res.ok || body.errors?.length || !body.data)
		throw new Error(body.errors?.[0]?.message ?? `GitHub returned ${res.status}.`);
	return body.data;
}

export async function readPrRefs(token: string, repo: string, number: number): Promise<PrRefs> {
	const [owner, name] = repo.split('/');
	const data = await graphql<{
		repository: {
			defaultBranchRef: { name: string } | null;
			pullRequest: { headRefName: string; baseRefName: string } | null;
		} | null;
	}>(
		token,
		'query($o: String!, $r: String!, $n: Int!) { repository(owner: $o, name: $r) { defaultBranchRef { name } pullRequest(number: $n) { headRefName baseRefName } } }',
		{ o: owner, r: name, n: number }
	);
	const pr = data.repository?.pullRequest;
	if (!pr) throw new Error('Not a pull request.');
	return {
		number,
		head: pr.headRefName,
		base: pr.baseRefName,
		defaultBranch: data.repository?.defaultBranchRef?.name ?? ''
	};
}

async function openPrsOnBranch(token: string, repo: string, branch: string) {
	const [owner, name] = repo.split('/');
	const data = await graphql<{
		repository: { pullRequests: { nodes: { number: number; headRefName: string }[] } } | null;
	}>(
		token,
		'query($o: String!, $r: String!, $b: String!) { repository(owner: $o, name: $r) { pullRequests(baseRefName: $b, states: OPEN, first: 5) { nodes { number headRefName } } } }',
		{ o: owner, r: name, b: branch }
	);
	return data.repository?.pullRequests.nodes ?? [];
}

async function openPrsAbove(token: string, repo: string, head: string) {
	const nearestFirst: number[] = [];
	const seen = new Set<string>([head]);
	let branch = head;
	for (let level = 0; level < MAX_LEVELS_ABOVE; level++) {
		const onBranch = await openPrsOnBranch(token, repo, branch);
		if (!onBranch.length) return { nearestFirst, branches: false };
		if (onBranch.length > 1)
			return { nearestFirst: [...nearestFirst, ...onBranch.map((p) => p.number)], branches: true };
		const [next] = onBranch;
		if (seen.has(next.headRefName)) break;
		seen.add(next.headRefName);
		nearestFirst.push(next.number);
		branch = next.headRefName;
	}
	return { nearestFirst, branches: false };
}

async function stackOnGitHub(token: string, repo: string, number: number) {
	const res = await gh(token, `/repos/${repo}/stacks?pull_request=${number}`);
	if (!res.ok) return { enabled: false, stack: null };
	const stacks = (await res.json().catch(() => [])) as GitHubStack[];
	return { enabled: true, stack: stacks[0] ?? null };
}

export async function readStack(token: string, repo: string, pr: PrRefs): Promise<PeekStack> {
	const [onGitHub, above] = await Promise.all([
		stackOnGitHub(token, repo, pr.number),
		openPrsAbove(token, repo, pr.head)
	]);
	const members = onGitHub.stack?.pull_requests ?? [];
	const at = members.findIndex((m) => m.number === pr.number);
	const isOpen = (m: GitHubStack['pull_requests'][number]) => m.state === 'open' && !m.merged_at;
	const openAboveOnGitHub = members
		.slice(at + 1)
		.filter(isOpen)
		.map((m) => m.number);
	return {
		gitHubStacksEnabled: onGitHub.enabled,
		numberOnGitHub: onGitHub.stack?.number ?? null,
		openPrsBelowOnGitHub: members
			.slice(0, Math.max(0, at))
			.filter(isOpen)
			.map((m) => m.number),
		mergesIntoDefaultBranch: pr.base === pr.defaultBranch,
		openPrsAboveNearestFirst: onGitHub.stack ? openAboveOnGitHub : above.nearestFirst,
		branchesAbove: !onGitHub.stack && above.branches
	};
}

async function refusal(res: Response) {
	const body = (await res.json().catch(() => ({}))) as {
		message?: string;
		errors?: ({ message?: string } | string)[];
	};
	const detail = body.errors?.map((e) => (typeof e === 'string' ? e : e.message)).filter(Boolean);
	return (
		[body.message, ...(detail ?? [])].filter(Boolean).join(': ') || `GitHub returned ${res.status}.`
	);
}

export async function linkStack(
	token: string,
	repo: string,
	chainBottomFirst: number[]
): Promise<string | null> {
	const res = await gh(token, `/repos/${repo}/stacks`, json({ pull_requests: chainBottomFirst }));
	return res.ok ? null : `GitHub could not link the stack: ${await refusal(res)}`;
}

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

export async function mergeStackThrough(
	token: string,
	repo: string,
	number: number,
	method: MergeMethod
): Promise<string | null> {
	const res = await gh(token, `/repos/${repo}/pulls/${number}/merge-async`, {
		method: 'PUT',
		body: JSON.stringify({ merge_method: method.toLowerCase(), merge_action: 'default' })
	});
	if (!res.ok) return refusal(res);
	let result = (await res.json().catch(() => ({}))) as AsyncMergeResult;
	const uuid = result.details?.uuid;
	for (let poll = 0; result.status === 'pending' && uuid && poll < ASYNC_MERGE_POLLS; poll++) {
		await wait(ASYNC_MERGE_POLL_MS);
		const next = await gh(token, `/repos/${repo}/pulls/${number}/merge-async/${uuid}`);
		if (next.ok) result = (await next.json().catch(() => result)) as AsyncMergeResult;
	}
	return result.status === 'failed'
		? (result.details?.message ?? 'GitHub could not merge it.')
		: null;
}
