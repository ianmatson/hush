import type { CategoryPin } from '../../src/lib/shared/categories';
import { MAX_SEARCH_CHARS } from '../../src/lib/shared/item-views';
import type { SnoozeChoice } from '../../src/lib/shared/item-snooze';
import { snoozeEvent } from '../../src/lib/shared/snooze';
import { routes, workspace, json, query } from '../app';

const MAX_ITEMS = 300;
const MAX_ID_CHARS = 100;
const LONGEST_SNOOZE_MS = 366 * 24 * 3600_000;

function categoryPinOf(body: Record<string, unknown>): CategoryPin | null {
	if (typeof body.group !== 'string') return null;
	if (body.category !== null && typeof body.category !== 'string') return null;
	return { group: body.group, category: body.category };
}

function itemIdsOf(ids: unknown): string[] {
	return Array.isArray(ids)
		? ids
				.filter((id): id is string => typeof id === 'string' && id.length <= MAX_ID_CHARS)
				.slice(0, MAX_ITEMS)
		: [];
}

function snoozeChoiceOf(body: Record<string, unknown>): SnoozeChoice | null {
	const { until, event } = body;
	if (until !== undefined && event !== undefined) return null;
	if (event !== undefined) {
		const known = typeof event === 'string' ? snoozeEvent(event) : undefined;
		return known ? { event: known.id } : null;
	}
	if (until === undefined) return {};
	const later =
		typeof until === 'number' && until > Date.now() && until < Date.now() + LONGEST_SNOOZE_MS;
	return later ? { until } : null;
}

const app = routes()
	.get('/api/teams', query<{ refresh: '1' }>(), async (c) =>
		c.json(await workspace(c.env, c.get('user').id).teams(c.req.query('refresh') === '1'))
	)
	.get('/api/searches/count', query<{ q: string }>(), async (c) => {
		const q = c.req.query('q') ?? '';
		if (!q.trim() || q.length > MAX_SEARCH_CHARS)
			return c.json({ error: `The search must have 1–${MAX_SEARCH_CHARS} characters.` }, 400);
		try {
			return c.json(await workspace(c.env, c.get('user').id).countSource(q));
		} catch (err) {
			return c.json({ error: (err as Error).message }, 502);
		}
	})
	.get('/api/items', async (c) => c.json(await workspace(c.env, c.get('user').id).items()))
	.post('/api/items/snooze', json<{ ids: string[] } & SnoozeChoice>(), async (c) => {
		const body = c.req.valid('json') as { ids?: unknown } & Record<string, unknown>;
		const ids = itemIdsOf(body.ids);
		if (!ids.length) return c.json({ error: 'Invalid items' }, 400);
		const choice = snoozeChoiceOf(body);
		if (!choice) return c.json({ error: 'Invalid snooze' }, 400);
		return c.json(await workspace(c.env, c.get('user').id).snooze(ids, choice));
	})
	.post('/api/items/unsnooze', json<{ ids: string[] }>(), async (c) => {
		const ids = itemIdsOf(c.req.valid('json').ids);
		if (!ids.length) return c.json({ error: 'Invalid items' }, 400);
		return c.json(await workspace(c.env, c.get('user').id).unsnooze(ids));
	})
	.post('/api/items/mute', json<{ ids: string[] }>(), async (c) => {
		const ids = itemIdsOf(c.req.valid('json').ids);
		if (!ids.length) return c.json({ error: 'Invalid items' }, 400);
		return c.json(await workspace(c.env, c.get('user').id).mute(ids));
	})
	.post('/api/items/pin', json<{ ids: string[] } & CategoryPin>(), async (c) => {
		const body = c.req.valid('json') as { ids?: unknown } & Record<string, unknown>;
		const ids = itemIdsOf(body.ids);
		if (!ids.length) return c.json({ error: 'Invalid items' }, 400);
		const pin = categoryPinOf(body);
		if (!pin) return c.json({ error: 'Invalid pin' }, 400);
		const out = await workspace(c.env, c.get('user').id).pin(ids, pin);
		if ('error' in out) return c.json({ error: out.error }, out.status);
		return c.json(out);
	})
	.post('/api/items/reevaluate', async (c) =>
		c.json(await workspace(c.env, c.get('user').id).reevaluate())
	);

export default app;
