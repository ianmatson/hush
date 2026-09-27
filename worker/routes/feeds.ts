import type { FeedDTO } from '../../src/lib/shared/types';
import { feedViewOk } from '../../src/lib/shared/views';
import { randomToken } from '../crypto';
import { renderFeed } from '../feeds';
import { routes } from '../app';

// --- Feeds: one inbox tab as Atom, at a secret URL ----------------------------------------

type FeedRow = { token: string; view: string; created_at: number };
const feedDTO = (origin: string, r: FeedRow): FeedDTO => ({
	view: r.view,
	url: `${origin}/feeds/${r.token}`,
	createdAt: r.created_at
});

const app = routes()
	.get('/api/feeds', async (c) => {
		const { results } = await c.env.DB.prepare(
			'SELECT token, view, created_at FROM feeds WHERE user_id = ? ORDER BY created_at'
		)
			.bind(c.get('user').id)
			.all<FeedRow>();
		const origin = new URL(c.req.url).origin;
		return c.json(results.map((r) => feedDTO(origin, r)));
	})
	/** Turn on the feed of a tab (or get the one it has). */
	.put('/api/feeds/:view', async (c) => {
		const view = c.req.param('view');
		if (!feedViewOk(view)) return c.json({ error: 'Unknown tab.' }, 400);
		const user = c.get('user').id;
		await c.env.DB.prepare(
			'INSERT INTO feeds (token, user_id, view, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, view) DO NOTHING'
		)
			.bind(randomToken(24), user, view, Date.now())
			.run();
		const row = await c.env.DB.prepare(
			'SELECT token, view, created_at FROM feeds WHERE user_id = ? AND view = ?'
		)
			.bind(user, view)
			.first<FeedRow>();
		return c.json(feedDTO(new URL(c.req.url).origin, row!));
	})
	/** Turn off a feed: its URL stops working. */
	.delete('/api/feeds/:view', async (c) => {
		await c.env.DB.prepare('DELETE FROM feeds WHERE user_id = ? AND view = ?')
			.bind(c.get('user').id, c.req.param('view'))
			.run();
		return c.json({ ok: true });
	})
	.get('/feeds/:token', (c) =>
		renderFeed(c.env, c.req.param('token').replace(/\.xml$/, ''), new URL(c.req.url).origin)
	);

export default app;
