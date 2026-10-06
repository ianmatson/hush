import { GH_ACTIONS, type GhActionId } from '../../src/lib/shared/actions';
import type { MergeMethod } from '../../src/lib/shared/types';
import { userToken } from '../db';
import { gh } from '../github';
import { linkStack, mergeStackThrough, readPrRefs, readStack } from '../stacks';
import { stackMergePlan } from '../../src/lib/shared/stack-merge';
import { REACTION_CONTENTS } from '../../src/lib/shared/reactions';
import { routes, poller, json } from '../app';

// --- Actions on GitHub (approve, comment, merge…), with the token Hush reads with ----------

// GitHub owner or repo name. Names of only dots ("..") are not allowed.
const NAME = /^(?!\.+$)[A-Za-z0-9_.-]{1,100}$/;
const METHODS = new Set<MergeMethod>(['MERGE', 'SQUASH', 'REBASE']);
const MAX_BODY = 65_536;
/** A GraphQL node ID ("IC_kwDO…"). */
const NODE_ID = /^[A-Za-z0-9_=-]{1,120}$/;

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

/** GitHub's reason for a refusal, as one sentence. */
async function refusal(res: Response): Promise<string> {
	const j = (await res.json().catch(() => ({}))) as {
		message?: string;
		errors?: ({ message?: string } | string)[];
	};
	const detail = j.errors?.map((e) => (typeof e === 'string' ? e : e.message)).filter(Boolean);
	return (
		[j.message, ...(detail ?? [])].filter(Boolean).join(': ') || `GitHub returned ${res.status}.`
	);
}

const app = routes()
	.post('/api/actions', json<ActionBody>(), async (c) => {
		// A local test copy writes nothing to GitHub.
		if (c.env.GITHUB_WRITES === 'off')
			return c.json({ error: 'GitHub writes are off in this copy (GITHUB_WRITES=off).' }, 403);
		const u = c.get('user');
		const b = c.req.valid('json');
		const [owner, name, extra] = typeof b.repo === 'string' ? b.repo.split('/') : [];
		const number = Number(b.number);
		if (!NAME.test(owner ?? '') || !NAME.test(name ?? '') || extra !== undefined)
			return c.json({ error: 'Not a repository.' }, 400);
		if (typeof b.action !== 'string' || !Object.hasOwn(GH_ACTIONS, b.action))
			return c.json({ error: 'Unknown action.' }, 400);
		const action: GhActionId = b.action;
		// A re-run can come from a workflow run's peek, with no PR or issue.
		const noSubject = action === 'rerun' && b.number === undefined;
		if (!noSubject && (!Number.isInteger(number) || number < 1))
			return c.json({ error: 'Not a PR or issue.' }, 400);
		const text = typeof b.body === 'string' ? b.body.trim() : '';
		if (text.length > MAX_BODY) return c.json({ error: 'The comment is too long.' }, 400);
		if (GH_ACTIONS[action].body === 'required' && !text)
			return c.json({ error: 'Write a comment first.' }, 400);

		const token = await userToken(c.env, u);
		const repo = `${owner}/${name}`;
		const call = (path: string, method: string, payload?: unknown) =>
			gh(token, path, {
				method,
				body: payload === undefined ? undefined : JSON.stringify(payload)
			});
		const graphql = async (query: string, variables: Record<string, unknown>) => {
			const res = await call('/graphql', 'POST', { query, variables });
			const j = (await res.json().catch(() => ({}))) as { errors?: { message: string }[] };
			return j.errors?.length
				? j.errors[0].message
				: res.ok
					? null
					: `GitHub returned ${res.status}.`;
		};

		let error: string | null = null;
		switch (action) {
			case 'approve':
			case 'request_changes': {
				const res = await call(`/repos/${repo}/pulls/${number}/reviews`, 'POST', {
					event: action === 'approve' ? 'APPROVE' : 'REQUEST_CHANGES',
					...(text ? { body: text } : {})
				});
				if (!res.ok) error = await refusal(res);
				break;
			}
			case 'comment': {
				const res = await call(`/repos/${repo}/issues/${number}/comments`, 'POST', { body: text });
				if (!res.ok) error = await refusal(res);
				break;
			}
			case 'rerun': {
				const runs = (Array.isArray(b.runs) ? b.runs : []).filter(
					(r) => Number.isInteger(r) && r > 0
				);
				if (!runs.length) return c.json({ error: 'No failed run to re-run.' }, 400);
				for (const run of runs.slice(0, 10)) {
					const res = await call(`/repos/${repo}/actions/runs/${run}/rerun-failed-jobs`, 'POST');
					if (!res.ok) error ??= await refusal(res);
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
				if (plan.kind === 'link') error = await linkStack(token, repo, plan.chainBottomFirst);
				if (error) break;
				if (plan.kind === 'link' || plan.kind === 'stack') {
					error = await mergeStackThrough(token, repo, number, b.method);
					break;
				}
				const res = await call(`/repos/${repo}/pulls/${number}/merge`, 'PUT', {
					merge_method: b.method.toLowerCase(),
					...(typeof b.sha === 'string' && /^[0-9a-f]{40}$/.test(b.sha) ? { sha: b.sha } : {})
				});
				if (!res.ok) error = await refusal(res);
				break;
			}
			case 'auto_merge':
			case 'auto_merge_off': {
				if (typeof b.id !== 'string' || !b.id) return c.json({ error: 'Not a pull request.' }, 400);
				if (action === 'auto_merge' && (!b.method || !METHODS.has(b.method)))
					return c.json({ error: 'Choose a merge method.' }, 400);
				error =
					action === 'auto_merge'
						? await graphql(
								'mutation($id: ID!, $m: PullRequestMergeMethod!) { enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: $m }) { clientMutationId } }',
								{ id: b.id, m: b.method }
							)
						: await graphql(
								'mutation($id: ID!) { disablePullRequestAutoMerge(input: { pullRequestId: $id }) { clientMutationId } }',
								{ id: b.id }
							);
				break;
			}
			case 'ready':
			case 'draft': {
				if (typeof b.id !== 'string' || !b.id) return c.json({ error: 'Not a pull request.' }, 400);
				error = await graphql(
					action === 'ready'
						? 'mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { clientMutationId } }'
						: 'mutation($id: ID!) { convertPullRequestToDraft(input: { pullRequestId: $id }) { clientMutationId } }',
					{ id: b.id }
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
				if (!res.ok) error = await refusal(res);
				break;
			}
		}
		if (error) return c.json({ error }, 422);
		if (noSubject) return c.json({ ok: true as const, resolved: [] });
		// Read it again now: the thread, the dashboards, and the peek show the new state at once.
		const { resolved } = await poller(c.env, u.id)
			.recheck(repo, number)
			.catch(() => ({ resolved: [] }));
		return c.json({ ok: true as const, resolved });
	})
	// Add or remove your reaction on a comment, a review, or a description.
	.post('/api/reactions', json<{ id: string; content: string; add: boolean }>(), async (c) => {
		if (c.env.GITHUB_WRITES === 'off')
			return c.json({ error: 'GitHub writes are off in this copy (GITHUB_WRITES=off).' }, 403);
		const b = c.req.valid('json');
		if (typeof b.id !== 'string' || !NODE_ID.test(b.id))
			return c.json({ error: 'Not a comment.' }, 400);
		if (typeof b.content !== 'string' || !REACTION_CONTENTS.has(b.content))
			return c.json({ error: 'Unknown reaction.' }, 400);
		const token = await userToken(c.env, c.get('user'));
		const verb = b.add ? 'addReaction' : 'removeReaction';
		const res = await gh(token, '/graphql', {
			method: 'POST',
			body: JSON.stringify({
				query: `mutation($id: ID!, $c: ReactionContent!) { ${verb}(input: { subjectId: $id, content: $c }) { clientMutationId } }`,
				variables: { id: b.id, c: b.content }
			})
		});
		const j = (await res.json().catch(() => ({}))) as { errors?: { message: string }[] };
		const error = j.errors?.[0]?.message ?? (res.ok ? null : `GitHub returned ${res.status}.`);
		if (error) return c.json({ error }, 422);
		return c.json({ ok: true as const });
	});

export default app;
