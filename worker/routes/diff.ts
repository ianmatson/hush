import {
	PULL_FILES_MAX_PAGES,
	PULL_FILES_PER_PAGE,
	isCommitOid,
	type PullCommit,
	type PendingReview,
	type ReviewEvent,
	type ReviewThread,
	type FileViewedState,
	type ViewedFiles
} from '../../src/lib/shared/diff';
import { isGitHubName, isItemNumber } from '../../src/lib/shared/item-page';
import { userToken } from '../db';
import { gh } from '../github';
import { json, query, routes } from '../app';
import { writeBlockForNode } from '../write-gate';

const PASSED_THROUGH_STATUSES = new Set([401, 403, 404]);
const NODE_ID = /^[A-Za-z0-9_=-]{1,120}$/;
const MAX_PATH_LENGTH = 1024;
const PULL_COMMITS_LIMIT = 100;
const THREADS_PER_PAGE = 100;
const THREAD_PAGES_LIMIT = 10;
const COMMENTS_PER_THREAD = 50;
const MAX_REPLY_LENGTH = 65_536;

const VIEWED_FILES_QUERY = `query($o: String!, $r: String!, $n: Int!, $after: String) {
  repository(owner: $o, name: $r) { pullRequest(number: $n) {
    files(first: ${PULL_FILES_PER_PAGE}, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { path viewerViewedState }
    }
  } }
}`;

const PULL_COMMITS_QUERY = `query($o: String!, $r: String!, $n: Int!) {
  repository(owner: $o, name: $r) { pullRequest(number: $n) {
    commits(last: ${PULL_COMMITS_LIMIT}) {
      nodes { commit { oid messageHeadline committedDate parents { totalCount } } }
    }
  } }
}`;

const REVIEW_THREADS_QUERY = `query($o: String!, $r: String!, $n: Int!, $after: String) {
  repository(owner: $o, name: $r) { pullRequest(number: $n) {
    reviews(states: [PENDING], first: 1) { nodes { id viewerDidAuthor comments { totalCount } } }
    reviewThreads(first: ${THREADS_PER_PAGE}, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id isResolved isOutdated path line startLine diffSide subjectType
        viewerCanReply viewerCanResolve viewerCanUnresolve
        comments(first: ${COMMENTS_PER_THREAD}) {
          totalCount
          nodes { id author { login avatarUrl } bodyHTML body createdAt url state viewerCanUpdate viewerCanDelete }
        }
      }
    }
  } }
}`;

const REPLY_TO_THREAD = `mutation($id: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $id, body: $body }) { comment { id } }
}`;
const RESOLVE_THREAD = `mutation($id: ID!) { resolveReviewThread(input: { threadId: $id }) { thread { id } } }`;
const UNRESOLVE_THREAD = `mutation($id: ID!) { unresolveReviewThread(input: { threadId: $id }) { thread { id } } }`;

type ThreadNode = {
	id: string;
	isResolved: boolean;
	isOutdated: boolean;
	path: string;
	line: number | null;
	startLine: number | null;
	diffSide: 'LEFT' | 'RIGHT';
	subjectType: 'LINE' | 'FILE';
	viewerCanReply: boolean;
	viewerCanResolve: boolean;
	viewerCanUnresolve: boolean;
	comments: {
		totalCount: number;
		nodes: {
			id: string;
			author: { login: string; avatarUrl: string } | null;
			bodyHTML: string;
			body: string;
			createdAt: string;
			url: string;
			state: string;
			viewerCanUpdate: boolean;
			viewerCanDelete: boolean;
		}[];
	};
};

type ReviewThreadsPage = {
	data?: {
		repository?: {
			pullRequest?: {
				reviews?: {
					nodes: { id: string; viewerDidAuthor: boolean; comments: { totalCount: number } }[];
				};
				reviewThreads?: {
					pageInfo: { hasNextPage: boolean; endCursor: string | null };
					nodes: ThreadNode[];
				};
			};
		};
	};
	errors?: { message: string }[];
};

function toReviewThread(node: ThreadNode): ReviewThread {
	return {
		id: node.id,
		path: node.path,
		line: node.line,
		startLine: node.startLine,
		side: node.diffSide,
		outdated: node.isOutdated,
		resolved: node.isResolved,
		fileLevel: node.subjectType === 'FILE',
		canReply: node.viewerCanReply,
		canResolve: node.viewerCanResolve,
		canUnresolve: node.viewerCanUnresolve,
		totalComments: node.comments.totalCount,
		comments: node.comments.nodes.map((c) => ({
			id: c.id,
			author: { login: c.author?.login ?? 'ghost', avatar: c.author?.avatarUrl ?? null },
			html: c.bodyHTML,
			body: c.body,
			at: c.createdAt,
			url: c.url,
			pending: c.state === 'PENDING',
			canEdit: c.viewerCanUpdate,
			canDelete: c.viewerCanDelete
		}))
	};
}

async function graphqlWrite(token: string, query: string, variables: Record<string, unknown>) {
	const res = await gh(token, '/graphql', {
		method: 'POST',
		body: JSON.stringify({ query, variables })
	});
	const result = (await res.json().catch(() => ({}))) as { errors?: { message: string }[] };
	if (!res.ok || result.errors?.length)
		return result.errors?.[0]?.message ?? `GitHub returned ${res.status}.`;
	return null;
}

const ADD_REVIEW_THREAD = `mutation($pr: ID!, $path: String!, $body: String!, $line: Int!, $side: DiffSide!, $startLine: Int, $startSide: DiffSide) {
  addPullRequestReviewThread(input: { pullRequestId: $pr, path: $path, body: $body, line: $line, side: $side, startLine: $startLine, startSide: $startSide }) { thread { id } }
}`;
const SUBMIT_REVIEW = `mutation($id: ID!, $event: PullRequestReviewEvent!, $body: String) {
  submitPullRequestReview(input: { pullRequestReviewId: $id, event: $event, body: $body }) { pullRequestReview { id } }
}`;
const DISCARD_REVIEW = `mutation($id: ID!) { deletePullRequestReview(input: { pullRequestReviewId: $id }) { pullRequestReview { id } } }`;
const EDIT_COMMENT = `mutation($id: ID!, $body: String!) {
  updatePullRequestReviewComment(input: { pullRequestReviewCommentId: $id, body: $body }) { pullRequestReviewComment { id } }
}`;
const DELETE_COMMENT = `mutation($id: ID!) { deletePullRequestReviewComment(input: { id: $id }) { clientMutationId } }`;

const REVIEW_EVENTS = new Set<ReviewEvent>(['COMMENT', 'APPROVE', 'REQUEST_CHANGES']);
const SIDES = new Set(['LEFT', 'RIGHT']);
const isLineNumber = (value: unknown): value is number =>
	typeof value === 'number' && Number.isInteger(value) && value > 0;
const isNodeId = (value: unknown): value is string =>
	typeof value === 'string' && NODE_ID.test(value);
const isBody = (value: unknown): value is string =>
	typeof value === 'string' && !!value.trim() && value.length <= MAX_REPLY_LENGTH;

type CommentInput = {
	repo: string;
	number: number;
	pullRequestId: string;
	commitOid: string;
	path: string;
	body: string;
	line: number;
	side: 'LEFT' | 'RIGHT';
	startLine: number | null;
	startSide: 'LEFT' | 'RIGHT' | null;
	single: boolean;
};

function validComment(b: Partial<CommentInput>): b is CommentInput {
	const [owner, name, extra] = typeof b.repo === 'string' ? b.repo.split('/') : [];
	const range = b.startLine === null || b.startLine === undefined;
	return (
		isGitHubName(owner ?? '') &&
		isGitHubName(name ?? '') &&
		extra === undefined &&
		isLineNumber(b.number) &&
		isNodeId(b.pullRequestId) &&
		isCommitOid(b.commitOid) &&
		typeof b.path === 'string' &&
		!!b.path &&
		b.path.length <= MAX_PATH_LENGTH &&
		isBody(b.body) &&
		isLineNumber(b.line) &&
		SIDES.has(b.side ?? '') &&
		(range
			? b.startSide === null || b.startSide === undefined
			: isLineNumber(b.startLine) && SIDES.has(b.startSide ?? '')) &&
		typeof b.single === 'boolean'
	);
}

async function postSingleComment(token: string, b: CommentInput): Promise<string | null> {
	const res = await gh(token, `/repos/${b.repo}/pulls/${b.number}/comments`, {
		method: 'POST',
		body: JSON.stringify({
			body: b.body,
			commit_id: b.commitOid,
			path: b.path,
			line: b.line,
			side: b.side,
			...(b.startLine ? { start_line: b.startLine, start_side: b.startSide } : {})
		})
	});
	if (res.ok) return null;
	const result = (await res.json().catch(() => ({}))) as {
		message?: string;
		errors?: (string | { message?: string })[];
	};
	const detail = result.errors?.map((e) => (typeof e === 'string' ? e : e.message)).filter(Boolean);
	return (
		[result.message, ...(detail ?? [])].filter(Boolean).join(': ') ||
		`GitHub returned ${res.status}.`
	);
}

const MARK_VIEWED = `mutation($id: ID!, $path: String!) {
  markFileAsViewed(input: { pullRequestId: $id, path: $path }) { clientMutationId }
}`;
const UNMARK_VIEWED = `mutation($id: ID!, $path: String!) {
  unmarkFileAsViewed(input: { pullRequestId: $id, path: $path }) { clientMutationId }
}`;

type PullCommitsResult = {
	data?: {
		repository?: {
			pullRequest?: {
				commits?: {
					nodes: {
						commit: {
							oid: string;
							messageHeadline: string;
							committedDate: string;
							parents: { totalCount: number };
						};
					}[];
				};
			};
		};
	};
	errors?: { message: string }[];
};

type ViewedFilesPage = {
	data?: {
		repository?: {
			pullRequest?: {
				files?: {
					pageInfo: { hasNextPage: boolean; endCursor: string | null };
					nodes: { path: string; viewerViewedState: string }[];
				};
			};
		};
	};
	errors?: { message: string }[];
};

function pageNumber(value: string | undefined): number | null {
	const page = Number(value ?? '1');
	return Number.isInteger(page) && page >= 1 && page <= PULL_FILES_MAX_PAGES ? page : null;
}

const validPull = (owner: string, repo: string, number: string) =>
	isGitHubName(owner) && isGitHubName(repo) && isItemNumber(number);

function passThroughFailure(status: number) {
	return (PASSED_THROUGH_STATUSES.has(status) ? status : 502) as 401 | 403 | 404 | 502;
}

const app = routes()
	.get('/api/diff/:owner/:repo/:number', query<{ page: string; head: string }>(), async (c) => {
		const { owner, repo, number } = c.req.param();
		const page = pageNumber(c.req.query('page'));
		if (!validPull(owner, repo, number) || page === null)
			return c.json({ error: 'Not a pull request page.' }, 400);
		const res = await gh(
			await userToken(c.env, c.get('user')),
			`/repos/${owner}/${repo}/pulls/${number}/files?per_page=${PULL_FILES_PER_PAGE}&page=${page}`
		);
		if (!res.ok)
			return c.json(
				{ error: `GitHub did not give the changed files (${res.status}).` },
				passThroughFailure(res.status)
			);
		return c.body(res.body ?? '[]', 200, {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'private, no-store'
		});
	})
	.get(
		'/api/diff/:owner/:repo/:number/compare',
		query<{ base: string; head: string }>(),
		async (c) => {
			const { owner, repo, number } = c.req.param();
			const base = c.req.query('base');
			const head = c.req.query('head');
			if (!validPull(owner, repo, number) || !isCommitOid(base) || !isCommitOid(head))
				return c.json({ error: 'Not a pair of commits.' }, 400);
			const res = await gh(
				await userToken(c.env, c.get('user')),
				`/repos/${owner}/${repo}/compare/${base}...${head}`
			);
			if (!res.ok)
				return c.json(
					{ error: `GitHub did not compare the commits (${res.status}).` },
					passThroughFailure(res.status)
				);
			return c.body(res.body ?? '{}', 200, {
				'Content-Type': 'application/json; charset=utf-8',
				'Cache-Control': 'private, no-store'
			});
		}
	)
	.get('/api/diff/:owner/:repo/:number/commits', async (c) => {
		const { owner, repo, number } = c.req.param();
		if (!validPull(owner, repo, number)) return c.json({ error: 'Not a pull request.' }, 400);
		const res = await gh(await userToken(c.env, c.get('user')), '/graphql', {
			method: 'POST',
			body: JSON.stringify({
				query: PULL_COMMITS_QUERY,
				variables: { o: owner, r: repo, n: Number(number) }
			})
		});
		if (!res.ok)
			return c.json(
				{ error: `GitHub did not give the commits (${res.status}).` },
				passThroughFailure(res.status)
			);
		const result = (await res.json()) as PullCommitsResult;
		const nodes = result.data?.repository?.pullRequest?.commits?.nodes;
		if (!nodes)
			return c.json({ error: result.errors?.[0]?.message ?? 'GitHub found no pull request.' }, 404);
		const commits: PullCommit[] = nodes.map(({ commit }) => ({
			oid: commit.oid,
			headline: commit.messageHeadline,
			merge: commit.parents.totalCount > 1,
			at: commit.committedDate
		}));
		return c.json({ commits }, 200, { 'Cache-Control': 'private, no-store' });
	})
	.get('/api/diff/:owner/:repo/:number/commit/:sha', async (c) => {
		const { owner, repo, number, sha } = c.req.param();
		if (!validPull(owner, repo, number) || !isCommitOid(sha))
			return c.json({ error: 'Not a commit.' }, 400);
		const res = await gh(
			await userToken(c.env, c.get('user')),
			`/repos/${owner}/${repo}/commits/${sha}`
		);
		if (!res.ok)
			return c.json(
				{ error: `GitHub did not give the commit (${res.status}).` },
				passThroughFailure(res.status)
			);
		return c.body(res.body ?? '{}', 200, {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'private, no-store'
		});
	})
	.get('/api/diff/:owner/:repo/:number/threads', async (c) => {
		const { owner, repo, number } = c.req.param();
		if (!validPull(owner, repo, number)) return c.json({ error: 'Not a pull request.' }, 400);
		const token = await userToken(c.env, c.get('user'));
		const threads: ReviewThread[] = [];
		let pendingReview: PendingReview | null = null;
		let after: string | null = null;
		for (let page = 0; page < THREAD_PAGES_LIMIT; page++) {
			const res = await gh(token, '/graphql', {
				method: 'POST',
				body: JSON.stringify({
					query: REVIEW_THREADS_QUERY,
					variables: { o: owner, r: repo, n: Number(number), after }
				})
			});
			if (!res.ok)
				return c.json(
					{ error: `GitHub did not give the review threads (${res.status}).` },
					passThroughFailure(res.status)
				);
			const result = (await res.json()) as ReviewThreadsPage;
			const found = result.data?.repository?.pullRequest?.reviewThreads;
			if (!found)
				return c.json(
					{ error: result.errors?.[0]?.message ?? 'GitHub found no pull request.' },
					404
				);
			const pending = result.data?.repository?.pullRequest?.reviews?.nodes.find(
				(r) => r.viewerDidAuthor
			);
			if (pending) pendingReview = { id: pending.id, comments: pending.comments.totalCount };
			threads.push(...found.nodes.filter((n) => n.comments.totalCount > 0).map(toReviewThread));
			if (!found.pageInfo.hasNextPage) break;
			after = found.pageInfo.endCursor;
		}
		return c.json({ threads, pendingReview }, 200, { 'Cache-Control': 'private, no-store' });
	})
	.post('/api/diff/threads/reply', json<{ threadId: string; body: string }>(), async (c) => {
		const b = c.req.valid('json');
		if (
			typeof b.threadId !== 'string' ||
			!NODE_ID.test(b.threadId) ||
			typeof b.body !== 'string' ||
			!b.body.trim() ||
			b.body.length > MAX_REPLY_LENGTH
		)
			return c.json({ error: 'Not a reply to a review thread.' }, 400);
		const token = await userToken(c.env, c.get('user'));
		const blocked = await writeBlockForNode(c.env, token, b.threadId);
		if (blocked) return c.json({ error: blocked }, 403);
		const failure = await graphqlWrite(token, REPLY_TO_THREAD, {
			id: b.threadId,
			body: b.body
		});
		return failure ? c.json({ error: failure }, 502) : c.json({ ok: true });
	})
	.post('/api/diff/threads/resolve', json<{ threadId: string; resolved: boolean }>(), async (c) => {
		const b = c.req.valid('json');
		if (
			typeof b.threadId !== 'string' ||
			!NODE_ID.test(b.threadId) ||
			typeof b.resolved !== 'boolean'
		)
			return c.json({ error: 'Not a review thread.' }, 400);
		const token = await userToken(c.env, c.get('user'));
		const blocked = await writeBlockForNode(c.env, token, b.threadId);
		if (blocked) return c.json({ error: blocked }, 403);
		const failure = await graphqlWrite(token, b.resolved ? RESOLVE_THREAD : UNRESOLVE_THREAD, {
			id: b.threadId
		});
		return failure ? c.json({ error: failure }, 502) : c.json({ ok: true });
	})
	.post('/api/diff/comment', json<CommentInput>(), async (c) => {
		const b = c.req.valid('json');
		if (!validComment(b)) return c.json({ error: 'Not a comment on a line of the diff.' }, 400);
		const token = await userToken(c.env, c.get('user'));
		const blocked = await writeBlockForNode(c.env, token, b.pullRequestId);
		if (blocked) return c.json({ error: blocked }, 403);
		const failure = b.single
			? await postSingleComment(token, b)
			: await graphqlWrite(token, ADD_REVIEW_THREAD, {
					pr: b.pullRequestId,
					path: b.path,
					body: b.body,
					line: b.line,
					side: b.side,
					startLine: b.startLine,
					startSide: b.startSide
				});
		return failure ? c.json({ error: failure }, 502) : c.json({ ok: true });
	})
	.post(
		'/api/diff/review/submit',
		json<{ reviewId: string; event: ReviewEvent; body: string }>(),
		async (c) => {
			const b = c.req.valid('json');
			if (
				!isNodeId(b.reviewId) ||
				!REVIEW_EVENTS.has(b.event as ReviewEvent) ||
				typeof b.body !== 'string' ||
				b.body.length > MAX_REPLY_LENGTH ||
				(b.event === 'REQUEST_CHANGES' && !b.body.trim())
			)
				return c.json({ error: 'Not a review to submit.' }, 400);
			const token = await userToken(c.env, c.get('user'));
			const blocked = await writeBlockForNode(c.env, token, b.reviewId);
			if (blocked) return c.json({ error: blocked }, 403);
			const failure = await graphqlWrite(token, SUBMIT_REVIEW, {
				id: b.reviewId,
				event: b.event,
				body: b.body.trim() || null
			});
			return failure ? c.json({ error: failure }, 502) : c.json({ ok: true });
		}
	)
	.post('/api/diff/review/discard', json<{ reviewId: string }>(), async (c) => {
		const b = c.req.valid('json');
		if (!isNodeId(b.reviewId)) return c.json({ error: 'Not a review.' }, 400);
		const token = await userToken(c.env, c.get('user'));
		const blocked = await writeBlockForNode(c.env, token, b.reviewId);
		if (blocked) return c.json({ error: blocked }, 403);
		const failure = await graphqlWrite(token, DISCARD_REVIEW, { id: b.reviewId });
		return failure ? c.json({ error: failure }, 502) : c.json({ ok: true });
	})
	.post('/api/diff/comment/edit', json<{ commentId: string; body: string | null }>(), async (c) => {
		const b = c.req.valid('json');
		const deleting = b.body === null;
		if (!isNodeId(b.commentId) || (!deleting && !isBody(b.body)))
			return c.json({ error: 'Not a review comment.' }, 400);
		const token = await userToken(c.env, c.get('user'));
		const blocked = await writeBlockForNode(c.env, token, b.commentId);
		if (blocked) return c.json({ error: blocked }, 403);
		const failure = deleting
			? await graphqlWrite(token, DELETE_COMMENT, { id: b.commentId })
			: await graphqlWrite(token, EDIT_COMMENT, { id: b.commentId, body: b.body });
		return failure ? c.json({ error: failure }, 502) : c.json({ ok: true });
	})
	.get('/api/diff/:owner/:repo/:number/viewed', async (c) => {
		const { owner, repo, number } = c.req.param();
		if (!validPull(owner, repo, number)) return c.json({ error: 'Not a pull request.' }, 400);
		const token = await userToken(c.env, c.get('user'));
		const viewed: ViewedFiles = {};
		let after: string | null = null;
		for (let page = 0; page < PULL_FILES_MAX_PAGES; page++) {
			const res = await gh(token, '/graphql', {
				method: 'POST',
				body: JSON.stringify({
					query: VIEWED_FILES_QUERY,
					variables: { o: owner, r: repo, n: Number(number), after }
				})
			});
			if (!res.ok)
				return c.json(
					{ error: `GitHub did not give the viewed files (${res.status}).` },
					passThroughFailure(res.status)
				);
			const json = (await res.json()) as ViewedFilesPage;
			const files = json.data?.repository?.pullRequest?.files;
			if (!files)
				return c.json({ error: json.errors?.[0]?.message ?? 'GitHub found no pull request.' }, 404);
			for (const file of files.nodes)
				if (file.viewerViewedState === 'VIEWED' || file.viewerViewedState === 'DISMISSED')
					viewed[file.path] = file.viewerViewedState as FileViewedState;
			if (!files.pageInfo.hasNextPage) break;
			after = files.pageInfo.endCursor;
		}
		return c.json({ viewed }, 200, { 'Cache-Control': 'private, no-store' });
	})
	.post(
		'/api/diff/viewed',
		json<{ pullRequestId: string; path: string; viewed: boolean }>(),
		async (c) => {
			const b = c.req.valid('json');
			if (
				typeof b.pullRequestId !== 'string' ||
				!NODE_ID.test(b.pullRequestId) ||
				typeof b.path !== 'string' ||
				!b.path ||
				b.path.length > MAX_PATH_LENGTH ||
				typeof b.viewed !== 'boolean'
			)
				return c.json({ error: 'Not a file of a pull request.' }, 400);
			const token = await userToken(c.env, c.get('user'));
			const blocked = await writeBlockForNode(c.env, token, b.pullRequestId);
			if (blocked) return c.json({ error: blocked }, 403);
			const res = await gh(token, '/graphql', {
				method: 'POST',
				body: JSON.stringify({
					query: b.viewed ? MARK_VIEWED : UNMARK_VIEWED,
					variables: { id: b.pullRequestId, path: b.path }
				})
			});
			const result = (await res.json().catch(() => ({}))) as { errors?: { message: string }[] };
			if (!res.ok || result.errors?.length)
				return c.json(
					{ error: result.errors?.[0]?.message ?? `GitHub returned ${res.status}.` },
					502
				);
			return c.json({ ok: true });
		}
	);

export default app;
