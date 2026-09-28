import type { SnoozeEvent } from '../../src/lib/shared/snooze';
import type { View } from '../../src/lib/shared/types';
import type { ThreadAction } from '../poller/data';
import { routes, poller, json, query } from '../app';

// --- Threads (the data and the rules are in the user's Durable Object: poller/data.ts) --------

/** Snooze takes a time or a condition; the other actions take no body. */
const snoozeBody = () => json<{ until?: number; event?: SnoozeEvent }>();

const app = routes()
	.get('/api/threads', query<{ view: View }>(), async (c) => {
		const view = (c.req.valid('query').view ?? 'action') as View;
		const r = await poller(c.env, c.get('user').id).listThreads(
			view,
			c.req.header('If-None-Match') ?? null,
			new URL(c.req.url).origin
		);
		if ('error' in r) return c.json({ error: r.error }, r.status);
		const headers = { 'Cache-Control': 'private, no-cache', ETag: r.etag };
		// Nothing changed since the client's copy.
		if ('notModified' in r) return c.body(null, 304, headers);
		return c.json({ threads: r.threads, counts: r.counts }, 200, headers);
	})
	// Before the :id route, so "bulk" is not read as a thread id.
	.post('/api/threads/bulk/:action', query<{ ids: string }>(), snoozeBody(), async (c) => {
		const ids = c.req.valid('query').ids?.split(',').filter(Boolean) ?? [];
		const r = await poller(c.env, c.get('user').id).threadAction(
			ids,
			c.req.param('action') as ThreadAction,
			c.req.valid('json')
		);
		if ('error' in r) return c.json({ error: r.error }, r.status);
		return c.json(r);
	})
	.post('/api/threads/:id/:action', snoozeBody(), async (c) => {
		const r = await poller(c.env, c.get('user').id).threadAction(
			[c.req.param('id')],
			c.req.param('action') as ThreadAction,
			c.req.valid('json')
		);
		if ('error' in r) return c.json({ error: r.error }, r.status);
		return c.json(r);
	})
	.post('/api/sync', async (c) => c.json(await poller(c.env, c.get('user').id).pollNow()));

export default app;
