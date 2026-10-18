import {
	PULL_FILES_MAX_PAGES,
	PULL_FILES_PER_PAGE,
	isCommitOid,
	threadExcerpt,
	type PullCommit,
	type PendingReview,
	type ReviewEvent,
	type ReviewThread,
	type FileViewedState,
	type ViewedFiles
} from '../../src/lib/shared/diff';
import { MAX_COMMENT_LENGTH } from '../../src/lib/shared/actions';
import {
	isGitHubName,
	isItemNumber,
	isNodeId,
	parseRepoFullName
} from '../../src/lib/shared/item-page';
import { userToken } from '../db';
import {
	gh,
	graphql,
	graphqlWriteFailure,
	restWriteFailure,
	type GraphqlResult,
	type WriteFailure
} from '../github';
import { json, query, routes, type Ctx } from '../app';
import { refreshWrittenSubject } from '../subject-writes';
import { checkNodeWrite, writeBlockForRepo } from '../write-gate';

const PASSED_THROUGH_STATUSES = new Set([401, 403, 404]);
const MAX_PATH_LENGTH = 1024;
const PULL_COMMITS_LIMIT = 100;
const THREADS_PER_PAGE = 100;
const THREAD_PAGES_LIMIT = 10;
const COMMENTS_PER_THREAD = 50;
const NO_STORE = { 'Cache-Control': 'private, no-store' };
const GITHUB_JSON = { 'Content-Type': 'application/json; charset=utf-8', ...NO_STORE };
const NO_PULL_REQUEST = 'GitHub found no pull request.';

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
        id isResolved isOutdated path line startLine originalStartLine diffSide startDiffSide subjectType
        viewerCanReply viewerCanResolve viewerCanUnresolve
        root: comments(first: 1) { nodes { diffHunk pullRequestReview { id } } }
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

export type ThreadNode = {
	id: string;
	isResolved: boolean;
	isOutdated: boolean;
	path: string;
	line: number | null;
	startLine: number | null;
	originalStartLine: number | null;
	diffSide: 'LEFT' | 'RIGHT';
	startDiffSide: 'LEFT' | 'RIGHT' | null;
	subjectType: 'LINE' | 'FILE';
	viewerCanReply: boolean;
	viewerCanResolve: boolean;
	viewerCanUnresolve: boolean;
	root: { nodes: { diffHunk: string; pullRequestReview: { id: string } | null }[] };
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

type PageInfo = { hasNextPage: boolean; endCursor: string | null };

type ReviewThreadsPage = {
	repository?: {
		pullRequest?: {
			reviews?: {
				nodes: { id: string; viewerDidAuthor: boolean; comments: { totalCount: number } }[];
			};
			reviewThreads?: { pageInfo: PageInfo; nodes: ThreadNode[] };
		};
	};
};

function excerptOf(node: ThreadNode, diffHunk: string) {
	if (node.subjectType === 'FILE') return [];
	const start =
		node.originalStartLine === null
			? null
			: { side: node.startDiffSide ?? node.diffSide, line: node.originalStartLine };
	return threadExcerpt(diffHunk, start);
}

export function toReviewThread(node: ThreadNode): ReviewThread {
	const root = node.root.nodes[0];
	return {
		id: node.id,
		reviewId: root?.pullRequestReview?.id ?? null,
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
		excerpt: root ? excerptOf(node, root.diffHunk) : [],
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
const isBody = (value: unknown): value is string =>
	typeof value === 'string' && !!value.trim() && value.length <= MAX_COMMENT_LENGTH;
const isFilePath = (value: unknown): value is string =>
	typeof value === 'string' && !!value && value.length <= MAX_PATH_LENGTH;

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
	const range = b.startLine === null || b.startLine === undefined;
	return (
		!!parseRepoFullName(b.repo) &&
		isLineNumber(b.number) &&
		isNodeId(b.pullRequestId) &&
		isCommitOid(b.commitOid) &&
		isFilePath(b.path) &&
		isBody(b.body) &&
		isLineNumber(b.line) &&
		SIDES.has(b.side ?? '') &&
		(range
			? b.startSide === null || b.startSide === undefined
			: isLineNumber(b.startLine) && SIDES.has(b.startSide ?? '')) &&
		typeof b.single === 'boolean'
	);
}

async function postSingleComment(token: string, b: CommentInput): Promise<WriteFailure | null> {
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
	}).catch(() => null);
	return res?.ok ? null : restWriteFailure(res);
}

const MARK_VIEWED = `mutation($id: ID!, $path: String!) {
  markFileAsViewed(input: { pullRequestId: $id, path: $path }) { clientMutationId }
}`;
const UNMARK_VIEWED = `mutation($id: ID!, $path: String!) {
  unmarkFileAsViewed(input: { pullRequestId: $id, path: $path }) { clientMutationId }
}`;

type PullCommitsResult = {
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

type ViewedFilesPage = {
	repository?: {
		pullRequest?: {
			files?: { pageInfo: PageInfo; nodes: { path: string; viewerViewedState: string }[] };
		};
	};
};

function pageNumber(value: string | undefined): number | null {
	const page = Number(value ?? '1');
	return Number.isInteger(page) && page >= 1 && page <= PULL_FILES_MAX_PAGES ? page : null;
}

const validPull = (owner: string, repo: string, number: string) =>
	isGitHubName(owner) && isGitHubName(repo) && isItemNumber(number);

type ReadFailureStatus = 401 | 403 | 404 | 502;
type ReadFailure = { error: string; status: ReadFailureStatus };

function passThroughFailure(status: number) {
	return (PASSED_THROUGH_STATUSES.has(status) ? status : 502) as ReadFailureStatus;
}

const githubDidNot = (action: string, status: number): ReadFailure => ({
	error: `GitHub did not ${action} (${status}).`,
	status: passThroughFailure(status)
});

async function proxyGitHubJson(c: Ctx, path: string, action: string, emptyBody: string) {
	const res = await gh(await userToken(c.env, c.get('user')), path);
	if (!res.ok) {
		const failure = githubDidNot(action, res.status);
		return c.json({ error: failure.error }, failure.status);
	}
	return c.body(res.body ?? emptyBody, 200, GITHUB_JSON);
}

async function readEveryPage<D>(
	token: string,
	query: string,
	variables: Record<string, unknown>,
	read: { action: string; pagesLimit: number; page: (data: D) => PageInfo | null }
): Promise<ReadFailure | null> {
	let after: string | null = null;
	for (let page = 0; page < read.pagesLimit; page++) {
		const result: GraphqlResult<D> = await graphql<D>(token, query, { ...variables, after });
		if (!result.ok) return githubDidNot(read.action, result.status);
		const pageInfo: PageInfo | null = result.data ? read.page(result.data) : null;
		if (!pageInfo) return { error: result.errors[0]?.message ?? NO_PULL_REQUEST, status: 404 };
		if (!pageInfo.hasNextPage) break;
		after = pageInfo.endCursor;
	}
	return null;
}

async function gatedNodeWrite(
	c: Ctx,
	nodeId: string,
	query: string,
	variables: Record<string, unknown>,
	{ refreshesSubject = true } = {}
) {
	const token = await userToken(c.env, c.get('user'));
	const { blocked, subject } = await checkNodeWrite(c.env, token, nodeId, {
		subjectNeeded: refreshesSubject
	});
	if (blocked) return c.json({ error: blocked }, 403);
	const failure = graphqlWriteFailure(await graphql(token, query, variables).catch(() => null));
	if (failure) return c.json({ error: failure.error }, failure.status);
	if (subject) await refreshWrittenSubject(c, subject);
	return c.json({ ok: true });
}

const app = routes()
	.get('/api/diff/:owner/:repo/:number', query<{ page: string; head: string }>(), async (c) => {
		const { owner, repo, number } = c.req.param();
		const page = pageNumber(c.req.query('page'));
		if (!validPull(owner, repo, number) || page === null)
			return c.json({ error: 'Not a pull request page.' }, 400);
		return proxyGitHubJson(
			c,
			`/repos/${owner}/${repo}/pulls/${number}/files?per_page=${PULL_FILES_PER_PAGE}&page=${page}`,
			'give the changed files',
			'[]'
		);
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
			return proxyGitHubJson(
				c,
				`/repos/${owner}/${repo}/compare/${base}...${head}`,
				'compare the commits',
				'{}'
			);
		}
	)
	.get('/api/diff/:owner/:repo/:number/commits', async (c) => {
		const { owner, repo, number } = c.req.param();
		if (!validPull(owner, repo, number)) return c.json({ error: 'Not a pull request.' }, 400);
		const result = await graphql<PullCommitsResult>(
			await userToken(c.env, c.get('user')),
			PULL_COMMITS_QUERY,
			{ o: owner, r: repo, n: Number(number) }
		);
		if (!result.ok) {
			const failure = githubDidNot('give the commits', result.status);
			return c.json({ error: failure.error }, failure.status);
		}
		const nodes = result.data?.repository?.pullRequest?.commits?.nodes;
		if (!nodes) return c.json({ error: result.errors[0]?.message ?? NO_PULL_REQUEST }, 404);
		const commits: PullCommit[] = nodes.map(({ commit }) => ({
			oid: commit.oid,
			headline: commit.messageHeadline,
			merge: commit.parents.totalCount > 1,
			at: commit.committedDate
		}));
		return c.json({ commits }, 200, NO_STORE);
	})
	.get('/api/diff/:owner/:repo/:number/commit/:sha', async (c) => {
		const { owner, repo, number, sha } = c.req.param();
		if (!validPull(owner, repo, number) || !isCommitOid(sha))
			return c.json({ error: 'Not a commit.' }, 400);
		return proxyGitHubJson(c, `/repos/${owner}/${repo}/commits/${sha}`, 'give the commit', '{}');
	})
	.get('/api/diff/:owner/:repo/:number/threads', async (c) => {
		const { owner, repo, number } = c.req.param();
		if (!validPull(owner, repo, number)) return c.json({ error: 'Not a pull request.' }, 400);
		const threads: ReviewThread[] = [];
		let pendingReview = null as PendingReview | null;
		const failure = await readEveryPage<ReviewThreadsPage>(
			await userToken(c.env, c.get('user')),
			REVIEW_THREADS_QUERY,
			{ o: owner, r: repo, n: Number(number) },
			{
				action: 'give the review threads',
				pagesLimit: THREAD_PAGES_LIMIT,
				page: (data) => {
					const pullRequest = data.repository?.pullRequest;
					const found = pullRequest?.reviewThreads;
					if (!found) return null;
					const pending = pullRequest.reviews?.nodes.find((r) => r.viewerDidAuthor);
					if (pending) pendingReview = { id: pending.id, comments: pending.comments.totalCount };
					threads.push(...found.nodes.filter((n) => n.comments.totalCount > 0).map(toReviewThread));
					return found.pageInfo;
				}
			}
		);
		if (failure) return c.json({ error: failure.error }, failure.status);
		return c.json({ threads, pendingReview }, 200, NO_STORE);
	})
	.post('/api/diff/threads/reply', json<{ threadId: string; body: string }>(), async (c) => {
		const b = c.req.valid('json');
		if (!isNodeId(b.threadId) || !isBody(b.body))
			return c.json({ error: 'Not a reply to a review thread.' }, 400);
		return gatedNodeWrite(c, b.threadId, REPLY_TO_THREAD, { id: b.threadId, body: b.body });
	})
	.post('/api/diff/threads/resolve', json<{ threadId: string; resolved: boolean }>(), async (c) => {
		const b = c.req.valid('json');
		if (!isNodeId(b.threadId) || typeof b.resolved !== 'boolean')
			return c.json({ error: 'Not a review thread.' }, 400);
		return gatedNodeWrite(c, b.threadId, b.resolved ? RESOLVE_THREAD : UNRESOLVE_THREAD, {
			id: b.threadId
		});
	})
	.post('/api/diff/comment', json<CommentInput>(), async (c) => {
		const b = c.req.valid('json');
		if (!validComment(b)) return c.json({ error: 'Not a comment on a line of the diff.' }, 400);
		if (!b.single)
			return gatedNodeWrite(c, b.pullRequestId, ADD_REVIEW_THREAD, {
				pr: b.pullRequestId,
				path: b.path,
				body: b.body,
				line: b.line,
				side: b.side,
				startLine: b.startLine,
				startSide: b.startSide
			});
		const blocked = writeBlockForRepo(c.env, b.repo);
		if (blocked) return c.json({ error: blocked }, 403);
		const failure = await postSingleComment(await userToken(c.env, c.get('user')), b);
		if (failure) return c.json({ error: failure.error }, failure.status);
		await refreshWrittenSubject(c, b);
		return c.json({ ok: true });
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
				b.body.length > MAX_COMMENT_LENGTH ||
				(b.event === 'REQUEST_CHANGES' && !b.body.trim())
			)
				return c.json({ error: 'Not a review to submit.' }, 400);
			return gatedNodeWrite(c, b.reviewId, SUBMIT_REVIEW, {
				id: b.reviewId,
				event: b.event,
				body: b.body.trim() || null
			});
		}
	)
	.post('/api/diff/review/discard', json<{ reviewId: string }>(), async (c) => {
		const b = c.req.valid('json');
		if (!isNodeId(b.reviewId)) return c.json({ error: 'Not a review.' }, 400);
		return gatedNodeWrite(c, b.reviewId, DISCARD_REVIEW, { id: b.reviewId });
	})
	.post('/api/diff/comment/edit', json<{ commentId: string; body: string | null }>(), async (c) => {
		const b = c.req.valid('json');
		const deleting = b.body === null;
		if (!isNodeId(b.commentId) || (!deleting && !isBody(b.body)))
			return c.json({ error: 'Not a review comment.' }, 400);
		return deleting
			? gatedNodeWrite(c, b.commentId, DELETE_COMMENT, { id: b.commentId })
			: gatedNodeWrite(c, b.commentId, EDIT_COMMENT, { id: b.commentId, body: b.body });
	})
	.get('/api/diff/:owner/:repo/:number/viewed', async (c) => {
		const { owner, repo, number } = c.req.param();
		if (!validPull(owner, repo, number)) return c.json({ error: 'Not a pull request.' }, 400);
		const viewed: ViewedFiles = {};
		const failure = await readEveryPage<ViewedFilesPage>(
			await userToken(c.env, c.get('user')),
			VIEWED_FILES_QUERY,
			{ o: owner, r: repo, n: Number(number) },
			{
				action: 'give the viewed files',
				pagesLimit: PULL_FILES_MAX_PAGES,
				page: (data) => {
					const files = data.repository?.pullRequest?.files;
					if (!files) return null;
					for (const file of files.nodes)
						if (file.viewerViewedState === 'VIEWED' || file.viewerViewedState === 'DISMISSED')
							viewed[file.path] = file.viewerViewedState as FileViewedState;
					return files.pageInfo;
				}
			}
		);
		if (failure) return c.json({ error: failure.error }, failure.status);
		return c.json({ viewed }, 200, NO_STORE);
	})
	.post(
		'/api/diff/viewed',
		json<{ pullRequestId: string; path: string; viewed: boolean }>(),
		async (c) => {
			const b = c.req.valid('json');
			if (!isNodeId(b.pullRequestId) || !isFilePath(b.path) || typeof b.viewed !== 'boolean')
				return c.json({ error: 'Not a file of a pull request.' }, 400);
			return gatedNodeWrite(
				c,
				b.pullRequestId,
				b.viewed ? MARK_VIEWED : UNMARK_VIEWED,
				{ id: b.pullRequestId, path: b.path },
				{ refreshesSubject: false }
			);
		}
	);

export default app;
