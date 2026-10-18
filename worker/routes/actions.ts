import { GH_ACTIONS, MAX_COMMENT_LENGTH, type GhActionId } from '../../src/lib/shared/actions';
import { isNodeId, parseRepoFullName } from '../../src/lib/shared/item-page';
import type { MergeMethod, PeekEntry } from '../../src/lib/shared/types';
import { userToken } from '../db';
import {
	failedWriteStatus,
	gh,
	graphql,
	graphqlWriteFailure,
	peekEntryFromRest,
	restWriteFailure,
	type RestFullMediaTimelineEntry,
	type WriteFailure
} from '../github';
import { linkStack, mergeStackThrough, readPrRefs, readStack } from '../stacks';
import { stackMergePlan } from '../../src/lib/shared/stack-merge';
import { REACTION_CONTENTS } from '../../src/lib/shared/reactions';
import { routes, json } from '../app';
import { refreshWrittenSubject } from '../subject-writes';
import { writeBlockForEveryRepo, writeBlockForNode, writeBlockForRepo } from '../write-gate';

// --- Actions on GitHub (approve, comment, merge…), with the token Hush reads with ----------

const METHODS = new Set<MergeMethod>(['MERGE', 'SQUASH', 'REBASE']);
const FULL_MEDIA = 'application/vnd.github.full+json';

type PullRequestNodeAction = Extract<
	GhActionId,
	'auto_merge' | 'auto_merge_off' | 'ready' | 'draft'
>;

const PULL_REQUEST_NODE_MUTATIONS: Record<PullRequestNodeAction, string> = {
	auto_merge:
		'mutation($id: ID!, $m: PullRequestMergeMethod!) { enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: $m }) { clientMutationId } }',
	auto_merge_off:
		'mutation($id: ID!) { disablePullRequestAutoMerge(input: { pullRequestId: $id }) { clientMutationId } }',
	ready:
		'mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { clientMutationId } }',
	draft:
		'mutation($id: ID!) { convertPullRequestToDraft(input: { pullRequestId: $id }) { clientMutationId } }'
};

const EDITABLE_COMMENT_QUERY = `query($id: ID!) { node(id: $id) {
  __typename
  ... on IssueComment { viewerDidAuthor viewerCanUpdate issue { number repository { nameWithOwner } } }
  ... on PullRequestReview { viewerDidAuthor viewerCanUpdate pullRequest { number repository { nameWithOwner } } }
} }`;

type CommentParent = { number: number; repository: { nameWithOwner: string } };
type EditableComment = {
	__typename: string;
	viewerDidAuthor: boolean;
	viewerCanUpdate: boolean;
	issue?: CommentParent;
	pullRequest?: CommentParent;
};

type ActionBody = {
	repo: string;
	number?: number;
	action: GhActionId;
	/** The comment (required for comment and request changes). */
	body?: string;
	method?: MergeMethod;
	/** The head commit the peek showed: GitHub refuses the merge if the branch moved since. */
	sha?: string;
	/** Workflow runs to re-run (their failed jobs). */
	runs?: number[];
	/** The PR's GraphQL node ID (auto-merge). */
	id?: string;
};

const app = routes()
	.post('/api/actions', json<ActionBody>(), async (c) => {
		const u = c.get('user');
		const b = c.req.valid('json');
		const target = parseRepoFullName(b.repo);
		const number = Number(b.number);
		if (!target) return c.json({ error: 'Not a repository.' }, 400);
		const repo = `${target.owner}/${target.name}`;
		const blocked = writeBlockForRepo(c.env, repo);
		if (blocked) return c.json({ error: blocked }, 403);
		if (typeof b.action !== 'string' || !Object.hasOwn(GH_ACTIONS, b.action))
			return c.json({ error: 'Unknown action.' }, 400);
		const action: GhActionId = b.action;
		// A re-run can come from a workflow run's peek, with no PR or issue.
		const noSubject = action === 'rerun' && b.number === undefined;
		if (!noSubject && (!Number.isInteger(number) || number < 1))
			return c.json({ error: 'Not a PR or issue.' }, 400);
		const text = typeof b.body === 'string' ? b.body.trim() : '';
		if (text.length > MAX_COMMENT_LENGTH) return c.json({ error: 'The comment is too long.' }, 400);
		if (GH_ACTIONS[action].body === 'required' && !text)
			return c.json({ error: 'Write a comment first.' }, 400);

		const token = await userToken(c.env, u);
		const call = (path: string, method: string, payload?: unknown, accept?: string) =>
			gh(token, path, {
				method,
				body: payload === undefined ? undefined : JSON.stringify(payload),
				headers: accept ? { Accept: accept } : undefined
			}).catch(() => null);
		const writtenEntry = async (type: PeekEntry['type'], res: Response) => {
			const j = (await res.json().catch(() => null)) as RestFullMediaTimelineEntry | null;
			return j?.html_url && j.node_id ? peekEntryFromRest(type, j) : null;
		};

		let failure: WriteFailure | null = null;
		let entry: PeekEntry | null = null;
		let stillMerging = false;
		switch (action) {
			case 'approve':
			case 'request_changes': {
				const res = await call(
					`/repos/${repo}/pulls/${number}/reviews`,
					'POST',
					{
						event: action === 'approve' ? 'APPROVE' : 'REQUEST_CHANGES',
						...(text ? { body: text } : {})
					},
					FULL_MEDIA
				);
				if (res?.ok) entry = await writtenEntry('review', res);
				else failure = await restWriteFailure(res);
				break;
			}
			case 'comment': {
				const res = await call(
					`/repos/${repo}/issues/${number}/comments`,
					'POST',
					{ body: text },
					FULL_MEDIA
				);
				if (res?.ok) entry = await writtenEntry('comment', res);
				else failure = await restWriteFailure(res);
				break;
			}
			case 'rerun': {
				const runs = (Array.isArray(b.runs) ? b.runs : []).filter(
					(r) => Number.isInteger(r) && r > 0
				);
				if (!runs.length) return c.json({ error: 'No failed run to re-run.' }, 400);
				for (const run of runs.slice(0, 10)) {
					const res = await call(`/repos/${repo}/actions/runs/${run}/rerun-failed-jobs`, 'POST');
					if (!res?.ok) failure ??= await restWriteFailure(res);
				}
				break;
			}
			case 'merge': {
				if (!b.method || !METHODS.has(b.method))
					return c.json({ error: 'Choose a merge method.' }, 400);
				const plan = await readPrRefs(token, repo, number)
					.then((refs) => readStack(token, repo, refs))
					.then((stack) => stackMergePlan(number, stack))
					.catch((e: Error) => e);
				if (plan instanceof Error)
					return c.json({ error: `Hush could not read the stack: ${plan.message}` }, 502);
				if (plan.kind === 'link') failure = await linkStack(token, repo, plan.chainBottomFirst);
				if (failure) break;
				if (plan.kind === 'link' || plan.kind === 'stack') {
					const merge = await mergeStackThrough(token, repo, number, b.method);
					if ('error' in merge) failure = merge;
					else stillMerging = merge.stillMerging;
					break;
				}
				const res = await call(`/repos/${repo}/pulls/${number}/merge`, 'PUT', {
					merge_method: b.method.toLowerCase(),
					...(typeof b.sha === 'string' && /^[0-9a-f]{40}$/.test(b.sha) ? { sha: b.sha } : {})
				});
				if (!res?.ok) failure = await restWriteFailure(res);
				break;
			}
			case 'auto_merge':
			case 'auto_merge_off':
			case 'ready':
			case 'draft': {
				if (!isNodeId(b.id)) return c.json({ error: 'Not a pull request.' }, 400);
				if (action === 'auto_merge' && (!b.method || !METHODS.has(b.method)))
					return c.json({ error: 'Choose a merge method.' }, 400);
				const nodeBlocked = await writeBlockForNode(c.env, token, b.id);
				if (nodeBlocked) return c.json({ error: nodeBlocked }, 403);
				const variables = action === 'auto_merge' ? { id: b.id, m: b.method } : { id: b.id };
				failure = graphqlWriteFailure(
					await graphql(token, PULL_REQUEST_NODE_MUTATIONS[action], variables).catch(() => null)
				);
				break;
			}
			case 'close':
			case 'close_not_planned':
			case 'reopen': {
				const res = await call(`/repos/${repo}/issues/${number}`, 'PATCH', {
					state: action === 'reopen' ? 'open' : 'closed',
					...(action === 'close_not_planned' ? { state_reason: 'not_planned' } : {})
				});
				if (!res?.ok) failure = await restWriteFailure(res);
				break;
			}
		}
		if (failure) return c.json({ error: failure.error }, failure.status);
		if (noSubject) return c.json({ ok: true as const, entry, stillMerging });
		refreshWrittenSubject(c, { repo, number });
		return c.json({ ok: true as const, entry, stillMerging });
	})
	.post('/api/comments/edit', json<{ id: string; body: string }>(), async (c) => {
		const b = c.req.valid('json');
		if (!isNodeId(b.id)) return c.json({ error: 'Not a comment.' }, 400);
		if (typeof b.body !== 'string' || !b.body.trim())
			return c.json({ error: 'Write a comment first.' }, 400);
		if (b.body.length > MAX_COMMENT_LENGTH)
			return c.json({ error: 'The comment is too long.' }, 400);
		const blockedEverywhere = writeBlockForEveryRepo(c.env);
		if (blockedEverywhere) return c.json({ error: blockedEverywhere }, 403);
		const u = c.get('user');
		const token = await userToken(c.env, u);
		const read = await graphql<{ node?: EditableComment | null }>(token, EDITABLE_COMMENT_QUERY, {
			id: b.id
		}).catch(() => null);
		if (!read?.ok || read.errors.length)
			return c.json(
				{ error: read?.errors[0]?.message ?? 'GitHub could not read the comment.' },
				502
			);
		const node = read.data?.node;
		if (!node) return c.json({ error: 'GitHub did not find this comment.' }, 404);
		const blocked = writeBlockForRepo(
			c.env,
			(node.pullRequest ?? node.issue)?.repository.nameWithOwner ?? null
		);
		if (blocked) return c.json({ error: blocked }, 403);
		const review = node.__typename === 'PullRequestReview';
		if (!review && node.__typename !== 'IssueComment')
			return c.json({ error: 'Not a comment.' }, 400);
		if (!node.viewerDidAuthor || !node.viewerCanUpdate)
			return c.json({ error: 'You can only edit your own editable comments.' }, 403);
		const parent = review ? node.pullRequest : node.issue;
		if (!parent) return c.json({ error: 'GitHub could not read the conversation.' }, 502);
		const mutation = review ? 'updatePullRequestReview' : 'updateIssueComment';
		const idField = review ? 'pullRequestReviewId' : 'id';
		const resultField = review ? 'pullRequestReview' : 'issueComment';
		const result = await graphql<
			Record<string, Record<string, { id: string; body: string; bodyHTML: string }> | null>
		>(
			token,
			`mutation($id: ID!, $body: String!) { ${mutation}(input: { ${idField}: $id, body: $body }) { ${resultField} { id body bodyHTML } } }`,
			{ id: b.id, body: b.body.trim() }
		).catch(() => null);
		const entry = result?.data?.[mutation]?.[resultField];
		if (!result?.ok || result.errors.length || !entry)
			return c.json(
				{ error: result?.errors[0]?.message ?? 'GitHub could not save the comment.' },
				result ? failedWriteStatus(result.status) : 502
			);
		refreshWrittenSubject(c, { repo: parent.repository.nameWithOwner, number: parent.number });
		return c.json({ id: entry.id, body: entry.body, html: entry.bodyHTML });
	})
	// Add or remove your reaction on a comment, a review, or a description.
	.post('/api/reactions', json<{ id: string; content: string; add: boolean }>(), async (c) => {
		const b = c.req.valid('json');
		if (!isNodeId(b.id)) return c.json({ error: 'Not a comment.' }, 400);
		if (typeof b.content !== 'string' || !REACTION_CONTENTS.has(b.content))
			return c.json({ error: 'Unknown reaction.' }, 400);
		const token = await userToken(c.env, c.get('user'));
		const blocked = await writeBlockForNode(c.env, token, b.id);
		if (blocked) return c.json({ error: blocked }, 403);
		const verb = b.add ? 'addReaction' : 'removeReaction';
		const failure = graphqlWriteFailure(
			await graphql(
				token,
				`mutation($id: ID!, $c: ReactionContent!) { ${verb}(input: { subjectId: $id, content: $c }) { clientMutationId } }`,
				{ id: b.id, c: b.content }
			).catch(() => null)
		);
		if (failure) return c.json({ error: failure.error }, failure.status);
		return c.json({ ok: true as const });
	});

export default app;
