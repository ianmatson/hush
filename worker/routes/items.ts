import type { SnoozeEvent } from '../../src/lib/shared/snooze';
import type { ItemAction, NotMineAnswer } from '../poller/data';
import type { ListView } from '../poller/schema';
import { routes, poller, json, query } from '../app';

// --- Items (the data and the rules are in the user's Durable Object: poller/data.ts) ----------

/** An item key: "owner/repo#123" or "t:<thread id>". */
const KEY = /^(?:[\w.-]{1,100}\/[\w.-]{1,100}#\d{1,9}|t:\d{1,20})$/;
const keysOf = (raw: unknown): string[] =>
	(Array.isArray(raw) ? raw : []).filter((k): k is string => typeof k === 'string' && KEY.test(k));

const app = routes()
	.get('/api/items', query<{ view: ListView }>(), async (c) => {
		const view = (c.req.valid('query').view ?? 'turn') as ListView;
		const r = await poller(c.env, c.get('user').id).listItems(
			view,
			c.req.header('If-None-Match') ?? null,
			new URL(c.req.url).origin
		);
		if ('error' in r) return c.json({ error: r.error }, r.status);
		const headers = { 'Cache-Control': 'private, no-cache', ETag: r.etag };
		// Nothing changed since the client's copy.
		if ('notModified' in r) return c.body(null, 304, headers);
		return c.json({ items: r.items, counts: r.counts, finished: r.finished }, 200, headers);
	})
	.get('/api/items/summary', async (c) => c.json(await poller(c.env, c.get('user').id).summary()))
	.get('/api/item', query<{ key: string }>(), async (c) => {
		const key = c.req.valid('query').key ?? '';
		if (!KEY.test(key)) return c.json({ error: 'Not an item.' }, 400);
		const r = await poller(c.env, c.get('user').id).item(key);
		if ('error' in r) return c.json({ error: r.error }, r.status);
		return c.json(r);
	})
	/** One action for up to 20 items. Snooze takes a time or a condition. */
	.post(
		'/api/items/action',
		json<{ keys: string[]; action: ItemAction; until?: number; event?: SnoozeEvent }>(),
		async (c) => {
			const b = c.req.valid('json');
			const r = await poller(c.env, c.get('user').id).itemAction(
				keysOf(b.keys),
				b.action as ItemAction,
				{ until: typeof b.until === 'number' ? b.until : undefined, event: b.event }
			);
			if ('error' in r) return c.json({ error: r.error }, r.status);
			return c.json(r);
		}
	)
	/** "Not my turn", with why: a setting, a rule, or only this item. */
	.post('/api/items/not-mine', json<{ key: string; answer: NotMineAnswer }>(), async (c) => {
		const b = c.req.valid('json');
		if (typeof b.key !== 'string' || !KEY.test(b.key))
			return c.json({ error: 'Not an item.' }, 400);
		const r = await poller(c.env, c.get('user').id).notMine(b.key, b.answer as NotMineAnswer);
		if ('error' in r) return c.json({ error: r.error }, r.status);
		return c.json(r);
	})
	.post('/api/items/finished-seen', async (c) =>
		c.json(await poller(c.env, c.get('user').id).finishedSeen())
	)
	.post('/api/onboarded', async (c) => c.json(await poller(c.env, c.get('user').id).setOnboarded()))
	.post('/api/sync', async (c) => c.json(await poller(c.env, c.get('user').id).pollNow()))
	.get('/api/teams', query<{ refresh: '1' }>(), async (c) =>
		c.json(await poller(c.env, c.get('user').id).teams(c.req.query('refresh') === '1'))
	);

export default app;
