import { DAY_MS } from '../../src/lib/shared/durations';
import type { SubjectFacts } from '../../src/lib/shared/subject';
import type { Item, ItemId } from '../../src/lib/model/types';

export const MAX_ROUTED_USERS = 50;
export const ROUTE_LEASE_MS = 3 * DAY_MS;

export const routeKey = (repoId: number, number: number) => `${repoId}#${number}`;

const routeOfFacts = (facts: SubjectFacts) =>
	typeof facts.repoId === 'number' ? routeKey(facts.repoId, facts.number) : null;

export function routesOf(
	items: ReadonlyMap<ItemId, Item>,
	ids: Iterable<ItemId>
): Map<string, ItemId> {
	const routes = new Map<string, ItemId>();
	for (const id of ids) {
		const facts = items.get(id)?.facts;
		const route = facts ? routeOfFacts(facts) : null;
		if (route) routes.set(route, id);
	}
	return routes;
}

export interface RouteTable {
	list(): Promise<string[]>;
	apply(add: string[], remove: string[], now: number): Promise<void>;
	clear(): Promise<void>;
}

export function d1RouteTable(db: D1Database, userId: number): RouteTable {
	return {
		async list() {
			const { results } = await db
				.prepare('SELECT route FROM webhook_routes WHERE user_id = ?')
				.bind(userId)
				.all<{ route: string }>();
			return results.map((row) => row.route);
		},
		async apply(add, remove, now) {
			await db.batch([
				db
					.prepare(
						'INSERT OR IGNORE INTO webhook_routes (route, user_id) SELECT value, ?1 FROM json_each(?2)'
					)
					.bind(userId, JSON.stringify(add)),
				db
					.prepare(
						'DELETE FROM webhook_routes WHERE user_id = ?1 AND route IN (SELECT value FROM json_each(?2))'
					)
					.bind(userId, JSON.stringify(remove)),
				db
					.prepare(
						`INSERT INTO webhook_route_leases (user_id, renewed_at) VALUES (?1, ?2)
             ON CONFLICT (user_id) DO UPDATE SET renewed_at = excluded.renewed_at`
					)
					.bind(userId, now)
			]);
		},
		async clear() {
			await db.batch([
				db.prepare('DELETE FROM webhook_routes WHERE user_id = ?').bind(userId),
				db.prepare('DELETE FROM webhook_route_leases WHERE user_id = ?').bind(userId)
			]);
		}
	};
}

export async function routedUsers(
	db: D1Database,
	routes: string[]
): Promise<Map<number, string[]>> {
	const { results } = await db
		.prepare(
			`SELECT user_id, route FROM webhook_routes
       WHERE route IN (SELECT value FROM json_each(?)) ORDER BY user_id`
		)
		.bind(JSON.stringify(routes))
		.all<{ user_id: number; route: string }>();
	const byUser = new Map<number, string[]>();
	for (const { user_id, route } of results) {
		if (!byUser.has(user_id) && byUser.size >= MAX_ROUTED_USERS) continue;
		byUser.set(user_id, [...(byUser.get(user_id) ?? []), route]);
	}
	return byUser;
}

export async function forgetStaleRoutes(db: D1Database, now: number) {
	const before = now - ROUTE_LEASE_MS;
	await db.batch([
		db
			.prepare(
				`DELETE FROM webhook_routes WHERE user_id IN
         (SELECT user_id FROM webhook_route_leases WHERE renewed_at < ?)`
			)
			.bind(before),
		db.prepare('DELETE FROM webhook_route_leases WHERE renewed_at < ?').bind(before)
	]);
}
