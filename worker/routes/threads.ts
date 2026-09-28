import type { SnoozeEvent } from '../../src/lib/shared/snooze';
import type { View } from '../../src/lib/shared/types';
import type { NotNeededAnswer, ThreadAction } from '../poller/data';
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
	/** "Doesn't need me": a thread id or a dashboard item ("owner/repo#123"), and why. */
	.post('/api/not-needed', json<{ id: string; answer: NotNeededAnswer }>(), async (c) => {
		const b = c.req.valid('json');
		if (typeof b.id !== 'string' || !b.id) return c.json({ error: 'Which thread?' }, 400);
		const r = await poller(c.env, c.get('user').id).notNeeded(b.id, b.answer as NotNeededAnswer);
		if ('error' in r) return c.json({ error: r.error }, r.status);
		return c.json(r);
	})
	.post('/api/not-needed/undo', json<{ id: string }>(), async (c) => {
		const b = c.req.valid('json');
		if (typeof b.id !== 'string' || !b.id) return c.json({ error: 'Which thread?' }, 400);
		return c.json(await poller(c.env, c.get('user').id).onlyThisOne(b.id, false));
	})
	.get('/api/threads/summary', async (c) => c.json(await poller(c.env, c.get('user').id).summary()))
	.post('/api/onboarded', async (c) => c.json(await poller(c.env, c.get('user').id).setOnboarded()))
	.post('/api/sync', async (c) => c.json(await poller(c.env, c.get('user').id).pollNow()));

export default app;
