import type { Item, Source, ViewState } from '../../src/lib/model/types';
import type { AlertCause, CommitResult, Config, WorkspaceData } from './commit';

export type SqlValue = string | number | null;

export interface Sql {
	exec<T extends Record<string, SqlValue>>(
		query: string,
		...bindings: SqlValue[]
	): { toArray(): T[] };
}

export interface SqlStorage {
	sql: Sql;
	transactionSync<T>(work: () => T): T;
}

export const WORKSPACE_SCHEMA_VERSION = 1;

export const WORKSPACE_SCHEMA = `
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  facts TEXT NOT NULL,
  project TEXT NOT NULL,
  analysis TEXT,
  attention TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, source TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS view_state (view_id TEXT PRIMARY KEY, state TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  reasons TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  delivery TEXT NOT NULL
);
`;

const CONFIG_KEY = 'config';
const REVISION_KEY = 'revision';
const TITLE_SEPARATOR = ' · ';

export type AlertDelivery =
	| { status: 'pending' }
	| { status: 'superseded'; by: string }
	| { status: 'done'; channels: Record<string, 'sent' | 'failed' | 'skipped'> };

export interface StoredAlert extends AlertCause {
	createdAt: number;
	delivery: AlertDelivery;
}

type ItemRow = {
	id: string;
	revision: number;
	facts: string;
	project: string;
	analysis: string | null;
	attention: string;
};

type AlertRow = {
	id: string;
	item_id: string;
	reasons: string;
	title: string;
	body: string;
	url: string;
	created_at: number;
	delivery: string;
};

const itemOf = (row: ItemRow): Item => ({
	id: row.id,
	revision: row.revision,
	facts: JSON.parse(row.facts),
	project: JSON.parse(row.project),
	analysis: row.analysis === null ? null : JSON.parse(row.analysis),
	attention: JSON.parse(row.attention)
});

const alertOf = (row: AlertRow): StoredAlert => ({
	id: row.id,
	itemId: row.item_id,
	reasons: JSON.parse(row.reasons),
	title: row.title,
	body: row.body,
	url: row.url,
	createdAt: row.created_at,
	delivery: JSON.parse(row.delivery)
});

export class WorkspaceStore {
	constructor(private readonly storage: SqlStorage) {}

	private rows<T extends Record<string, SqlValue>>(query: string, ...bindings: SqlValue[]) {
		return this.storage.sql.exec<T>(query, ...bindings).toArray();
	}

	private run(query: string, ...bindings: SqlValue[]) {
		this.storage.sql.exec(query, ...bindings);
	}

	migrate() {
		this.storage.sql.exec(WORKSPACE_SCHEMA);
	}

	readState<T>(key: string): T | null {
		const [row] = this.rows<{ value: string }>('SELECT value FROM state WHERE key = ?', key);
		return row ? (JSON.parse(row.value) as T) : null;
	}

	writeState(key: string, value: unknown) {
		this.run(
			'INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
			key,
			JSON.stringify(value)
		);
	}

	load(): WorkspaceData | null {
		const config = this.readState<Config>(CONFIG_KEY);
		if (!config) return null;
		return {
			config,
			items: new Map(this.rows<ItemRow>('SELECT * FROM items').map((row) => [row.id, itemOf(row)])),
			sources: new Map(
				this.rows<{ id: string; source: string }>('SELECT id, source FROM sources').map((row) => [
					row.id,
					JSON.parse(row.source) as Source
				])
			),
			views: new Map(
				this.rows<{ view_id: string; state: string }>('SELECT view_id, state FROM view_state').map(
					(row) => [row.view_id, JSON.parse(row.state) as ViewState]
				)
			),
			revision: this.readState<number>(REVISION_KEY) ?? 0
		};
	}

	create(config: Config): WorkspaceData {
		this.storage.transactionSync(() => {
			this.writeState(CONFIG_KEY, config);
			this.writeState(REVISION_KEY, 0);
		});
		return { config, items: new Map(), sources: new Map(), views: new Map(), revision: 0 };
	}

	save(result: CommitResult, now: number, extraState: Record<string, unknown> = {}) {
		const { data, changes, alerts } = result;
		this.storage.transactionSync(() => {
			for (const id of changes.removedItems) this.run('DELETE FROM items WHERE id = ?', id);
			for (const id of changes.items) this.putItem(data.items.get(id)!);
			for (const id of changes.removedSources) this.run('DELETE FROM sources WHERE id = ?', id);
			for (const id of changes.sources)
				this.run(
					'INSERT INTO sources (id, source) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET source = excluded.source',
					id,
					JSON.stringify(data.sources.get(id))
				);
			for (const id of changes.removedViews)
				this.run('DELETE FROM view_state WHERE view_id = ?', id);
			for (const id of changes.views)
				this.run(
					'INSERT INTO view_state (view_id, state) VALUES (?, ?) ON CONFLICT (view_id) DO UPDATE SET state = excluded.state',
					id,
					JSON.stringify(data.views.get(id))
				);
			if (changes.config) this.writeState(CONFIG_KEY, data.config);
			if (data.revision !== this.readState<number>(REVISION_KEY))
				this.writeState(REVISION_KEY, data.revision);
			for (const alert of alerts) this.addAlert(alert, now);
			for (const [key, value] of Object.entries(extraState)) this.writeState(key, value);
		});
	}

	private putItem(item: Item) {
		this.run(
			`INSERT INTO items (id, revision, facts, project, analysis, attention) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET revision = excluded.revision, facts = excluded.facts,
       project = excluded.project, analysis = excluded.analysis, attention = excluded.attention`,
			item.id,
			item.revision,
			JSON.stringify(item.facts),
			JSON.stringify(item.project),
			item.analysis === null ? null : JSON.stringify(item.analysis),
			JSON.stringify(item.attention)
		);
	}

	private addAlert(alert: AlertCause, now: number) {
		const pending = this.rows<AlertRow>(
			`SELECT * FROM alerts WHERE item_id = ? AND id != ? AND json_extract(delivery, '$.status') = 'pending'`,
			alert.itemId,
			alert.id
		).map(alertOf);
		const combined = pending.reduce<AlertCause>(
			(merged, older) => ({
				...merged,
				reasons: [...new Set([...older.reasons, ...merged.reasons])],
				title: [
					...new Set([
						...older.title.split(TITLE_SEPARATOR),
						...merged.title.split(TITLE_SEPARATOR)
					])
				].join(TITLE_SEPARATOR)
			}),
			alert
		);
		for (const older of pending) this.setDelivery(older.id, { status: 'superseded', by: alert.id });
		this.run(
			`INSERT OR IGNORE INTO alerts (id, item_id, reasons, title, body, url, created_at, delivery)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			combined.id,
			combined.itemId,
			JSON.stringify(combined.reasons),
			combined.title,
			combined.body,
			combined.url,
			now,
			JSON.stringify({ status: 'pending' } satisfies AlertDelivery)
		);
	}

	pendingAlerts(): StoredAlert[] {
		return this.rows<AlertRow>(
			`SELECT * FROM alerts WHERE json_extract(delivery, '$.status') = 'pending' ORDER BY created_at`
		).map(alertOf);
	}

	alertHistory(limit: number): StoredAlert[] {
		return this.rows<AlertRow>('SELECT * FROM alerts ORDER BY created_at DESC LIMIT ?', limit).map(
			alertOf
		);
	}

	setDelivery(id: string, delivery: AlertDelivery) {
		this.run('UPDATE alerts SET delivery = ? WHERE id = ?', JSON.stringify(delivery), id);
	}

	forgetAlertsBefore(cutoff: number) {
		this.run('DELETE FROM alerts WHERE created_at < ?', cutoff);
	}

	wipe() {
		this.storage.transactionSync(() => {
			for (const table of ['items', 'sources', 'view_state', 'state', 'alerts'])
				this.run(`DELETE FROM ${table}`);
		});
	}
}
