import {
	PULL_FILES_MAX_PAGES,
	PULL_FILES_PER_PAGE,
	isCommitOid,
	type PullCommit,
	type FileViewedState,
	type ViewedFiles
} from '../../src/lib/shared/diff';
import { isGitHubName, isItemNumber } from '../../src/lib/shared/item-page';
import { userToken } from '../db';
import { gh } from '../github';
import { json, query, routes } from '../app';

const PASSED_THROUGH_STATUSES = new Set([401, 403, 404]);
const NODE_ID = /^[A-Za-z0-9_=-]{1,120}$/;
const MAX_PATH_LENGTH = 1024;
const PULL_COMMITS_LIMIT = 100;

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
			if (c.env.GITHUB_WRITES === 'off')
				return c.json({ error: 'GitHub writes are off in this copy (GITHUB_WRITES=off).' }, 403);
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
			const res = await gh(await userToken(c.env, c.get('user')), '/graphql', {
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
