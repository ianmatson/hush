import { routes, poller } from '../app';

// --- Live updates ------------------------------------------------------------------------

/**
 * The tab's WebSocket to its user's Durable Object, which says what changed (see
 * PollerBase.broadcast and src/lib/live.svelte.ts). The session check ran before this, like for
 * every /api route.
 */
const app = routes().get('/api/live', (c) => {
	if (c.req.header('Upgrade') !== 'websocket')
		return c.json({ error: 'Expected a WebSocket' }, 426);
	// A page on another site must not open your socket (cross-site WebSocket hijacking).
	const origin = c.req.header('Origin');
	if (origin && origin !== new URL(c.req.url).origin)
		return c.json({ error: 'Cross-origin request' }, 403);
	return poller(c.env, c.get('user').id).fetch(c.req.raw);
});

export default app;
