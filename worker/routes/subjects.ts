import type { PeekDTO } from '../../src/lib/shared/types';
import { userToken } from '../db';
import { fetchPeek, GitHubError } from '../github';
import { routes, poller } from '../app';

const app = routes();

// --- Quick check -----------------------------------------------------------

// GitHub owner or repo name. Names of only dots ("..") are not allowed.
const NAME = /^(?!\.+$)[A-Za-z0-9_.-]{1,100}$/;

/** You came back from a PR or issue on GitHub: look at it again now, not in 15 minutes. */
app.post('/api/recheck', async (c) => {
	const u = c.get('user');
	const body = (await c.req.json().catch(() => ({}))) as { repo?: unknown; number?: unknown };
	const repo = typeof body.repo === 'string' ? body.repo : '';
	const [owner, name, extra] = repo.split('/');
	const number = Number(body.number);
	if (
		!NAME.test(owner ?? '') ||
		!NAME.test(name ?? '') ||
		extra !== undefined ||
		!Number.isInteger(number) ||
		number < 1
	)
		return c.json({ error: 'Not a PR or issue.' }, 400);
	return c.json(await poller(c.env, u.id).recheck(repo, number));
});

// --- Peek ------------------------------------------------------------------

app.get('/api/peek/:owner/:repo/:number', async (c) => {
	const u = c.get('user');
	const { owner, repo } = c.req.param();
	const number = Number(c.req.param('number'));
	if (!NAME.test(owner) || !NAME.test(repo) || !Number.isInteger(number) || number < 1)
		return c.json({ error: 'Not a PR or issue.' }, 400);
	try {
		const found = await fetchPeek(await userToken(c.env, u), u.login, owner, repo, number);
		if (!found)
			return c.json(
				{ error: 'GitHub did not find this PR or issue. Maybe you have no access.' },
				404
			);
		// The peek is a fresh read too: store it, so the inbox and dashboards agree with it.
		const sync = await poller(c.env, u.id)
			.recordFetched(found.subject)
			.catch(() => ({ changed: false, resolved: [] }));
		return c.json({ ...found.peek, sync } satisfies PeekDTO, 200, {
			'Cache-Control': 'private, no-store'
		});
	} catch (err) {
		const status = err instanceof GitHubError && err.status === 401 ? 401 : 502;
		return c.json({ error: (err as Error).message }, status);
	}
});

export default app;
