import { PULL_FILES_MAX_PAGES, PULL_FILES_PER_PAGE } from '../../src/lib/shared/diff';
import { isGitHubName, isItemNumber } from '../../src/lib/shared/item-page';
import { userToken } from '../db';
import { gh } from '../github';
import { query, routes } from '../app';

const PASSED_THROUGH_STATUSES = new Set([401, 403, 404]);

function pageNumber(value: string | undefined): number | null {
	const page = Number(value ?? '1');
	return Number.isInteger(page) && page >= 1 && page <= PULL_FILES_MAX_PAGES ? page : null;
}

const app = routes().get(
	'/api/diff/:owner/:repo/:number',
	query<{ page: string; head: string }>(),
	async (c) => {
		const { owner, repo, number } = c.req.param();
		const page = pageNumber(c.req.query('page'));
		if (!isGitHubName(owner) || !isGitHubName(repo) || !isItemNumber(number) || page === null)
			return c.json({ error: 'Not a pull request page.' }, 400);
		const res = await gh(
			await userToken(c.env, c.get('user')),
			`/repos/${owner}/${repo}/pulls/${number}/files?per_page=${PULL_FILES_PER_PAGE}&page=${page}`
		);
		if (!res.ok) {
			const status = PASSED_THROUGH_STATUSES.has(res.status) ? res.status : 502;
			return c.json(
				{ error: `GitHub did not give the changed files (${res.status}).` },
				status as 401 | 403 | 404 | 502
			);
		}
		return c.body(res.body ?? '[]', 200, {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'private, no-store'
		});
	}
);

export default app;
