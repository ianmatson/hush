import type { FeedDTO, FeedFilter } from '../../src/lib/shared/types';
import { randomToken } from '../crypto';
import { renderFeed } from '../feeds';
import { routes } from '../app';

const app = routes();

// --- Feeds ------------------------------------------------------------------

function feedDTO(
	origin: string,
	r: { id: string; name: string; token: string; filter: string; created_at: number }
): FeedDTO {
	return {
		id: r.id,
		name: r.name,
		filter: JSON.parse(r.filter),
		url: `${origin}/feeds/${r.token}`,
		createdAt: r.created_at
	};
}

app.get('/api/feeds', async (c) => {
	const { results } = await c.env.DB.prepare(
		'SELECT * FROM feeds WHERE user_id = ? ORDER BY created_at'
	)
		.bind(c.get('user').id)
		.all<{ id: string; name: string; token: string; filter: string; created_at: number }>();
	const origin = new URL(c.req.url).origin;
	return c.json(results.map((r) => feedDTO(origin, r)));
});

app.post('/api/feeds', async (c) => {
	const body = await c.req.json<{ name?: string; filter?: FeedFilter }>().catch(() => null);
	const name = body?.name?.trim();
	const view = body?.filter?.view;
	if (!name) return c.json({ error: 'Give the feed a name.' }, 400);
	if (view !== 'action' && view !== 'fyi' && view !== 'all')
		return c.json({ error: 'Unknown feed view.' }, 400);
	const filter: FeedFilter = {
		view,
		...(body?.filter?.repo?.trim() ? { repo: body.filter.repo.trim() } : {})
	};
	const row = {
		id: randomToken(9),
		name: name.slice(0, 80),
		token: randomToken(24),
		filter: JSON.stringify(filter),
		created_at: Date.now()
	};
	await c.env.DB.prepare(
		'INSERT INTO feeds (id, user_id, name, token, filter, created_at) VALUES (?, ?, ?, ?, ?, ?)'
	)
		.bind(row.id, c.get('user').id, row.name, row.token, row.filter, row.created_at)
		.run();
	return c.json(feedDTO(new URL(c.req.url).origin, row));
});

app.delete('/api/feeds/:id', async (c) => {
	await c.env.DB.prepare('DELETE FROM feeds WHERE user_id = ? AND id = ?')
		.bind(c.get('user').id, c.req.param('id'))
		.run();
	return c.json({ ok: true });
});

app.get('/feeds/:token', (c) =>
	renderFeed(c.env, c.req.param('token').replace(/\.xml$/, ''), new URL(c.req.url).origin)
);

export default app;
