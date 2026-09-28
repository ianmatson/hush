import type { FeedDTO } from '../../src/lib/shared/types';
import { feedViewOk } from '../../src/lib/shared/search';
import { randomToken, sha256 } from '../crypto';
import { renderFeed } from '../feeds';
import { routes } from '../app';

// --- Feeds: one inbox tab as Atom, at a secret URL ----------------------------------------

type FeedRow = { view: string; created_at: number };
const feedDTO = (r: FeedRow, url?: string): FeedDTO => ({
	view: r.view,
	createdAt: r.created_at,
	...(url ? { url } : {})
});

// Only the hash of a feed's secret is stored, so its address is known only when it is made: the
// response to PUT is the one time it is sent.
const app = routes()
	.get('/api/feeds', async (c) => {
		const { results } = await c.env.DB.prepare(
			'SELECT view, created_at FROM feeds WHERE user_id = ? ORDER BY created_at'
		)
			.bind(c.get('user').id)
			.all<FeedRow>();
		return c.json(results.map((r) => feedDTO(r)));
	})
	/** Make the feed of a tab, with a new address (an old address of that tab stops working). */
	.put('/api/feeds/:view', async (c) => {
		const view = c.req.param('view');
		if (!feedViewOk(view)) return c.json({ error: 'Unknown tab.' }, 400);
		const token = randomToken(24);
		const row: FeedRow = { view, created_at: Date.now() };
		await c.env.DB.prepare(
			`INSERT INTO feeds (token_hash, user_id, view, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, view) DO UPDATE SET token_hash = excluded.token_hash, created_at = excluded.created_at`
		)
			.bind(await sha256(token), c.get('user').id, view, row.created_at)
			.run();
		return c.json(feedDTO(row, `${new URL(c.req.url).origin}/feeds/${token}`));
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
