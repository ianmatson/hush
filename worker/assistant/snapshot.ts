import { presentDashboard, type SeenItem } from '../../src/lib/shared/dashboard-presentation';
import type { ItemMark } from '../../src/lib/shared/item-snooze';
import { parseSettings } from '../../src/lib/shared/settings';
import type { SubjectFacts } from '../../src/lib/shared/subject';
import type { CategoryGroup, DashKind, DashResponse, ItemView } from '../../src/lib/shared/types';
import { dashSignature, type CachedDash } from '../poller/dashboard-cache';
import { SCHEMA_VERSION } from '../poller/schema';
import { DASH_TTL, IN_KEYS } from '../poller/shared';

export interface SnapshotStorage {
	get(keys: string[]): Promise<Map<string, unknown>>;
	sql: Pick<SqlStorage, 'exec'>;
}

export interface SnapshotPrincipal {
	userId: number;
	login: string;
}

export type CacheState = 'fresh' | 'stale' | 'missing' | 'settings_changed';

export interface SnapshotDashboard {
	kind: DashKind;
	state: CacheState;
	fetchedAt: number | null;
	data?: DashResponse;
}

export interface SavedViewsSnapshot {
	principal: SnapshotPrincipal;
	views: ItemView[];
	categoryGroups: CategoryGroup[];
	dashboards: SnapshotDashboard[];
}

export class SnapshotUnavailable extends Error {
	constructor(public readonly code: 'scope_mismatch' | 'schema_not_ready') {
		super(code);
	}
}

export function createSnapshotReader(storage: SnapshotStorage, principal: SnapshotPrincipal) {
	const scope = { ...principal };
	return async (now = Date.now()): Promise<SavedViewsSnapshot> => {
		const values = await storage.get(['userId', 'schema', 'settings', 'dash:pr', 'dash:issue']);
		if (values.get('userId') !== scope.userId) throw new SnapshotUnavailable('scope_mismatch');
		if (values.get('schema') !== SCHEMA_VERSION) throw new SnapshotUnavailable('schema_not_ready');
		const settings = parseSettings(values.get('settings') as string | undefined);
		const dashboards: SnapshotDashboard[] = (['pr', 'issue'] as const).map((kind) => {
			const cached = values.get(`dash:${kind}`) as CachedDash | undefined;
			if (!cached) return { kind, state: 'missing', fetchedAt: null };
			if (cached.sig !== dashSignature(kind, settings) || !cached.data.sourceItems)
				return { kind, state: 'settings_changed', fetchedAt: cached.data.fetchedAt };
			return {
				kind,
				state: now - cached.data.fetchedAt < DASH_TTL ? 'fresh' : 'stale',
				fetchedAt: cached.data.fetchedAt,
				data: cached.data
			};
		});
		const keys = [...new Set(dashboards.flatMap((d) => d.data?.items.map((i) => i.id) ?? []))];
		const select = <T>(query: string): T[] =>
			keys.length ? (storage.sql.exec(query, JSON.stringify(keys)).toArray() as T[]) : [];
		const facts = new Map(
			select<{ key: string; facts: string }>(
				`SELECT key, facts FROM subjects WHERE key ${IN_KEYS}`
			).map((row) => [row.key, JSON.parse(row.facts) as SubjectFacts])
		);
		const seen = new Map<string, SeenItem>(
			select<{ key: string; at: number; snapshot: string }>(
				`SELECT key, at, snapshot FROM seen WHERE key ${IN_KEYS}`
			).map((row) => [row.key, { at: row.at, snapshot: JSON.parse(row.snapshot) }])
		);
		const marks = new Map<string, ItemMark>(
			select<{
				item_id: string;
				updated_at: string;
				snoozed_until: number | null;
				snooze_event: ItemMark['snoozeEvent'];
				snoozed_at: number | null;
			}>(`SELECT * FROM dash_snoozed WHERE item_id ${IN_KEYS}`).map((row) => [
				row.item_id,
				{
					updatedAt: row.updated_at,
					snoozedUntil: row.snoozed_until,
					snoozeEvent: row.snooze_event,
					snoozedAt: row.snoozed_at
				}
			])
		);
		return {
			principal: { ...scope },
			views: settings.views,
			categoryGroups: settings.categoryGroups,
			dashboards: dashboards.map((d) =>
				d.data ? { ...d, data: presentDashboard(d.data, scope.login, facts, marks, seen, now) } : d
			)
		};
	};
}
