import type { DashKind, Turn } from '../../src/lib/shared/types';
import { routes, poller, json, query } from '../app';

const TURNS = new Set<Turn>(['you', 'team', 'them', 'none']);

/**
 * Save a drop: an optional move to another group (`turn`, or null to undo a move) and the new
 * order of the target group.
 */
type ItemRef = { id: string; updatedAt: string };
const validRefs = (items: unknown): items is ItemRef[] =>
	Array.isArray(items) &&
	items.length > 0 &&
	items.length <= 300 &&
	items.every(
		(i) =>
			typeof i?.id === 'string' &&
			i.id.length <= 100 &&
			typeof i.updatedAt === 'string' &&
			!Number.isNaN(Date.parse(i.updatedAt))
	);

// --- PR and issue dashboards -----------------------------------------------

const app = routes()
	.get('/api/teams', query<{ refresh: '1' }>(), async (c) => {
		const u = c.get('user');
		return c.json(await poller(c.env, u.id).teams(c.req.query('refresh') === '1'));
	})
	.get('/api/dashboard/:kind', query<{ refresh: '1' }>(), async (c) => {
		const kind = c.req.param('kind') as DashKind;
		if (kind !== 'pr' && kind !== 'issue') return c.json({ error: 'Unknown dashboard' }, 400);
		return c.json(
			await poller(c.env, c.get('user').id).dashboardView(kind, c.req.query('refresh') === '1')
		);
	})
	/**
	 * Save a drop. Each item may carry `turn`: a group to move it to, null to undo your move, or
	 * absent to leave it. `order` is the new order of the target group.
	 */
	.post(
		'/api/dashboard/arrange',
		json<{ items: (ItemRef & { turn?: Turn | null })[]; order: string[] }>(),
		async (c) => {
			const u = c.get('user');
			const body = c.req.valid('json');
			if (!validRefs(body.items)) return c.json({ error: 'Invalid items' }, 400);
			const items = body.items as (ItemRef & { turn?: Turn | null })[];
			if (items.some((i) => i.turn != null && !TURNS.has(i.turn)))
				return c.json({ error: 'Unknown group' }, 400);
			const order = body.order ?? [];
			if (
				!Array.isArray(order) ||
				order.length > 300 ||
				order.some((id) => typeof id !== 'string' || id.length > 100)
			)
				return c.json({ error: 'Invalid order' }, 400);

			return c.json(await poller(c.env, u.id).arrange(items, order));
		}
	)
	.post('/api/dashboard/hide', json<{ items: ItemRef[] }>(), async (c) => {
		const u = c.get('user');
		const body = c.req.valid('json');
		if (!validRefs(body.items)) return c.json({ error: 'Invalid items' }, 400);
		return c.json(await poller(c.env, u.id).hide(body.items));
	})
	.post('/api/dashboard/mute', json<{ ids: string[] }>(), async (c) => {
		const body = c.req.valid('json');
		const ids = Array.isArray(body.ids)
			? (body.ids as unknown[])
					.filter((id): id is string => typeof id === 'string' && id.length <= 100)
					.slice(0, 20)
			: [];
		if (!ids.length) return c.json({ error: 'Invalid items' }, 400);
		return c.json(await poller(c.env, c.get('user').id).mute(ids));
	})
	.post('/api/dashboard/unhide', json<{ ids: string[] }>(), async (c) => {
		const u = c.get('user');
		const body = c.req.valid('json');
		const ids = Array.isArray(body.ids)
			? (body.ids as unknown[]).filter((id): id is string => typeof id === 'string').slice(0, 300)
			: [];
		if (!ids.length) return c.json({ error: 'Invalid items' }, 400);
		return c.json(await poller(c.env, u.id).unhide(ids));
	});

export default app;
