import type { DashItem, DashKind, Turn } from '../../src/lib/shared/types';
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
		const u = c.get('user');
		const kind = c.req.param('kind') as DashKind;
		if (kind !== 'pr' && kind !== 'issue') return c.json({ error: 'Unknown dashboard' }, 400);
		const perUser = <T>(sql: string) => c.env.DB.prepare(sql).bind(u.id).all<T>();
		const [data, hidden, moves, order] = await Promise.all([
			poller(c.env, u.id).dashboard(kind, c.req.query('refresh') === '1'),
			perUser<{ item_id: string; updated_at: string }>(
				'SELECT item_id, updated_at FROM dash_hidden WHERE user_id = ?'
			),
			perUser<{ item_id: string; turn: Turn; updated_at: string }>(
				'SELECT item_id, turn, updated_at FROM dash_moves WHERE user_id = ?'
			),
			perUser<{ item_id: string; rank: number }>(
				'SELECT item_id, rank FROM dash_order WHERE user_id = ?'
			)
		]);
		// Hidden and moved last "until it changes": a newer updatedAt undoes them.
		const unchanged = (i: DashItem, at: string | undefined) =>
			!!at && Date.parse(i.updatedAt) <= Date.parse(at);
		const hiddenAt = new Map(hidden.results.map((h) => [h.item_id, h.updated_at]));
		const moved = new Map(moves.results.map((m) => [m.item_id, m]));
		const ranks = new Map(order.results.map((o) => [o.item_id, o.rank]));
		for (const i of data.items) {
			i.dismissed = unchanged(i, hiddenAt.get(i.id));
			const m = moved.get(i.id);
			i.autoTurn = i.turn;
			i.movedByYou = !!m && unchanged(i, m.updated_at) && m.turn !== i.turn;
			if (i.movedByYou) i.turn = m!.turn;
			i.rank = ranks.get(i.id) ?? null;
		}
		return c.json(data);
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

			const db = c.env.DB;
			const stmts: D1PreparedStatement[] = [];
			for (const item of items) {
				if (item.turn === null)
					stmts.push(
						db
							.prepare('DELETE FROM dash_moves WHERE user_id = ? AND item_id = ?')
							.bind(u.id, item.id)
					);
				else if (item.turn)
					stmts.push(
						db
							.prepare(
								`INSERT INTO dash_moves (user_id, item_id, turn, updated_at, created_at) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (user_id, item_id) DO UPDATE SET turn = excluded.turn, updated_at = excluded.updated_at`
							)
							.bind(u.id, item.id, item.turn, item.updatedAt, Date.now())
					);
			}
			order.forEach((id, rank) =>
				stmts.push(
					db
						.prepare(
							`INSERT INTO dash_order (user_id, item_id, rank) VALUES (?, ?, ?)
           ON CONFLICT (user_id, item_id) DO UPDATE SET rank = excluded.rank`
						)
						.bind(u.id, id, rank)
				)
			);
			if (stmts.length) await db.batch(stmts);
			return c.json({ ok: true });
		}
	)
	.post('/api/dashboard/hide', json<{ items: ItemRef[] }>(), async (c) => {
		const u = c.get('user');
		const body = c.req.valid('json');
		if (!validRefs(body.items)) return c.json({ error: 'Invalid items' }, 400);
		await c.env.DB.batch(
			body.items.map((i) =>
				c.env.DB.prepare(
					`INSERT INTO dash_hidden (user_id, item_id, updated_at, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, item_id) DO UPDATE SET updated_at = excluded.updated_at`
				).bind(u.id, i.id, i.updatedAt, Date.now())
			)
		);
		return c.json({ ok: true });
	})
	.post('/api/dashboard/unhide', json<{ ids: string[] }>(), async (c) => {
		const u = c.get('user');
		const body = c.req.valid('json');
		const ids = Array.isArray(body.ids)
			? (body.ids as unknown[]).filter((id): id is string => typeof id === 'string').slice(0, 300)
			: [];
		if (!ids.length) return c.json({ error: 'Invalid items' }, 400);
		await c.env.DB.batch(
			ids.map((id) =>
				c.env.DB.prepare('DELETE FROM dash_hidden WHERE user_id = ? AND item_id = ?').bind(u.id, id)
			)
		);
		return c.json({ ok: true });
	});

export default app;
