import { gateAllowsRepo, writeGate, writesBlockedMessage } from '../src/lib/shared/write-gate';
import type { Env } from './db';
import { gh } from './github';

const NODE_REPOSITORY_QUERY = `query($id: ID!) { node(id: $id) {
  ... on PullRequest { repository { nameWithOwner } }
  ... on PullRequestReviewThread { repository { nameWithOwner } }
  ... on PullRequestReview { repository { nameWithOwner } }
  ... on PullRequestReviewComment { repository { nameWithOwner } }
  ... on IssueComment { repository { nameWithOwner } }
  ... on Issue { repository { nameWithOwner } }
} }`;

async function repositoryOfNode(token: string, id: string): Promise<string | null> {
	const res = await gh(token, '/graphql', {
		method: 'POST',
		body: JSON.stringify({ query: NODE_REPOSITORY_QUERY, variables: { id } })
	});
	if (!res.ok) return null;
	const json = (await res.json().catch(() => ({}))) as {
		data?: { node?: { repository?: { nameWithOwner?: string } } | null };
	};
	return json.data?.node?.repository?.nameWithOwner ?? null;
}

export function writeBlockForRepo(env: Env, repo: string): string | null {
	const gate = writeGate(env.GITHUB_WRITES, env.GITHUB_WRITES_ALLOW);
	return gateAllowsRepo(gate, repo) ? null : writesBlockedMessage(gate);
}

export async function writeBlockForNode(
	env: Env,
	token: string,
	nodeId: string
): Promise<string | null> {
	const gate = writeGate(env.GITHUB_WRITES, env.GITHUB_WRITES_ALLOW);
	if (gate.kind === 'all') return null;
	if (gate.kind === 'none') return writesBlockedMessage(gate);
	return gateAllowsRepo(gate, await repositoryOfNode(token, nodeId))
		? null
		: writesBlockedMessage(gate);
}
