import { isGitHubName, parseRepoFullName } from '../../src/lib/shared/item-page';
import type { PeekDTO } from '../../src/lib/shared/types';
import { userToken } from '../db';
import { fetchPeek, GitHubError } from '../github';
import { routes, poller, json } from '../app';

// --- Quick check -----------------------------------------------------------

const app = routes()
	/** You came back from a PR or issue on GitHub: look at it again now, not in 15 minutes. */
	.post('/api/recheck', json<{ repo: string; number: number }>(), async (c) => {
		const u = c.get('user');
		const body = c.req.valid('json') as { repo?: unknown; number?: unknown };
		const target = parseRepoFullName(body.repo);
		const number = Number(body.number);
		if (!target || !Number.isInteger(number) || number < 1)
			return c.json({ error: 'Not a PR or issue.' }, 400);
		const result = await poller(c.env, u.id).recheck(`${target.owner}/${target.name}`, number);
		if ('error' in result) return c.json({ error: result.error }, 502);
		return c.json(result);
	})
	// --- Peek ------------------------------------------------------------------

	.get('/api/peek/:owner/:repo/:number', async (c) => {
		const u = c.get('user');
		const { owner, repo } = c.req.param();
		const number = Number(c.req.param('number'));
		if (!isGitHubName(owner) || !isGitHubName(repo) || !Number.isInteger(number) || number < 1)
			return c.json({ error: 'Not a PR or issue.' }, 400);
		try {
			const found = await fetchPeek(await userToken(c.env, u), u.login, owner, repo, number);
			if (!found)
				return c.json(
					{ error: 'GitHub did not find this PR or issue. Maybe you have no access.' },
					404
				);
			// The peek is a fresh read too: store it, so the dashboards agree with it.
			if (found.subject)
				c.executionCtx.waitUntil(
					poller(c.env, u.id)
						.recordFetched(found.subject)
						.catch((err) => console.error('peek record failed', (err as Error).message))
				);
			return c.json(found.peek satisfies PeekDTO, 200, {
				'Cache-Control': 'private, no-store'
			});
		} catch (err) {
			const status = err instanceof GitHubError && err.status === 401 ? 401 : 502;
			return c.json({ error: (err as Error).message }, status);
		}
	});

export default app;
