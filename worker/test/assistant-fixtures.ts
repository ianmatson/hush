import { vi } from 'vitest';
import { compileViews, viewScope } from '../../src/lib/model/compile';
import type { Item, ItemId, Source, ViewState } from '../../src/lib/model/types';
import { DEFAULT_SETTINGS } from '../../src/lib/shared/settings';
import type { SubjectFacts } from '../../src/lib/shared/subject';
import type { DashKind, ItemView, Settings } from '../../src/lib/shared/types';
import { createSavedViewTools } from '../assistant/tools';
import type { Env } from '../db';
import type { CommitResult, Config, WorkspaceData } from '../workspace/commit';
import { ANALYSIS_VERSION, Workspace } from '../workspace/object';
import { WorkspaceStore, type SqlStorage, type SqlValue } from '../workspace/store';
import { subjectFixture } from './subject-fixtures';
import { memoryStorage } from './workspace-fixtures';

export const NOW = Date.parse('2026-10-21T10:00:00Z');
export const ME = 'reviewer';
export const VIEW: ItemView = {
	id: 'mine',
	name: 'Mine',
	searches: ['repo:sandbox/web is:open'],
	groupBy: 'role'
};

const READ_QUERY = /^\s*SELECT\b/i;

const NO_VIEW_STATE: ViewState = {
	scope: '',
	members: [],
	retained: [],
	seededBindings: [],
	baseline: [],
	awaitingRefresh: []
};

function subjectsAt(at: string): SubjectFacts[] {
	const pull = (number: number) => `https://github.com/sandbox/web/pull/${number}`;
	const subjects = [
		subjectFixture({ id: 'PR_1', number: 1, url: pull(1), author: ME, title: 'Zulu' }),
		subjectFixture({
			id: 'PR_2',
			number: 2,
			url: pull(2),
			reviewRequests: [{ name: ME, team: false }],
			title: 'Alpha'
		}),
		subjectFixture({
			id: 'I_3',
			number: 3,
			kind: 'issue',
			url: 'https://github.com/sandbox/web/issues/3',
			assignees: [ME],
			title: 'Beta'
		}),
		subjectFixture({ id: 'PR_4', number: 4, url: pull(4), title: 'Hidden' })
	];
	for (const subject of subjects) {
		subject.updatedAt = at;
		subject.createdAt = at;
		subject.lastCommitAt = at;
	}
	return subjects;
}

const itemOf = (facts: SubjectFacts): Item => ({
	id: facts.id,
	revision: 1,
	facts,
	project: { state: 'unavailable' },
	analysis: null,
	attention: { seen: null, markedUnread: false, snooze: null, muted: false, pins: [] }
});

function doState(raw: SqlStorage, writes: (...args: unknown[]) => void) {
	const values = new Map<string, unknown>();
	const queries: string[] = [];
	const settingsWrites = vi.fn();
	let alarm: number | null = null;
	const sql = {
		exec(query: string, ...bindings: SqlValue[]) {
			queries.push(query);
			if (!READ_QUERY.test(query)) writes(query);
			return raw.sql.exec(query, ...bindings);
		}
	};
	const storage = {
		sql,
		transactionSync: <T>(work: () => T) => raw.transactionSync(work),
		get: vi.fn(async (keys: string | string[]) =>
			Array.isArray(keys)
				? new Map(
						keys.flatMap((key) =>
							values.has(key) ? [[key, structuredClone(values.get(key))]] : []
						)
					)
				: structuredClone(values.get(keys))
		),
		put: vi.fn(async (entries: string | Record<string, unknown>, value?: unknown) => {
			const all = typeof entries === 'string' ? { [entries]: value } : entries;
			settingsWrites(all);
			writes(all);
			for (const [key, next] of Object.entries(all)) values.set(key, structuredClone(next));
		}),
		delete: vi.fn(async (key: string) => {
			writes(key);
			return values.delete(key);
		}),
		deleteAll: vi.fn(async () => {
			writes();
			values.clear();
		}),
		getAlarm: vi.fn(async () => alarm),
		setAlarm: vi.fn(async (at: number) => {
			writes(at);
			alarm = at;
		}),
		deleteAlarm: vi.fn(async () => {
			writes();
			alarm = null;
		})
	};
	const ctx = {
		storage,
		waitUntil: () => {},
		blockConcurrencyWhile: <T>(work: () => Promise<T>) => work(),
		getWebSockets: () => [],
		setWebSocketAutoResponse: () => {},
		acceptWebSocket: () => {}
	} as unknown as DurableObjectState;
	return { ctx, storage, values, queries, settingsWrites };
}

export function assistantFixture(userId = 1) {
	vi.stubGlobal(
		'WebSocketRequestResponsePair',
		class {
			constructor(
				public request: string,
				public response: string
			) {}
		}
	);
	const raw = memoryStorage();
	const seed = new WorkspaceStore(raw);
	seed.migrate();
	seed.writeState('account', { userId });
	const settings: Settings = structuredClone(DEFAULT_SETTINGS);
	settings.views = [structuredClone(VIEW)];
	const config: Config = {
		me: ME,
		settings,
		teams: [],
		projectAccess: 'none',
		analysisVersion: ANALYSIS_VERSION,
		projects: []
	};
	seed.create(config);
	const subjects = subjectsAt(new Date(NOW).toISOString());
	const items = new Map(subjects.map((subject) => [subject.id, itemOf(subject)]));
	const found: ItemId[] = ['PR_1', 'PR_2', 'I_3'];
	const sources = new Map<string, Source>();
	const views = new Map<string, ViewState>();
	let revision = 0;

	const save = (changed: {
		items?: ItemId[];
		sources?: string[];
		views?: string[];
		config?: boolean;
	}) => {
		revision++;
		const data: WorkspaceData = { config, items, sources, views, revision };
		const result: CommitResult = {
			data,
			changes: {
				items: new Set(changed.items),
				removedItems: new Set(),
				sources: new Set(changed.sources),
				removedSources: new Set(),
				views: new Set(changed.views),
				removedViews: new Set(),
				config: !!changed.config
			},
			alerts: [],
			changedViews: [],
			departed: [],
			interest: new Set(),
			nextBoundary: null
		};
		seed.save(result, Date.now());
	};

	const compileContext = () => ({
		dash: settings.dash,
		categoryGroups: settings.categoryGroups,
		smartDecisions: settings.smartDecisions,
		teams: config.teams,
		analysisVersion: config.analysisVersion,
		now: Date.now()
	});

	const windowOf = (kind: DashKind) => ({
		candidates: found
			.map((id) => items.get(id)!.facts)
			.filter((facts) => facts.kind === kind)
			.map((facts) => ({ id: facts.id, updatedAt: facts.updatedAt })),
		truncated: false
	});

	const saveSettings = ({ searched = true }: { searched?: boolean } = {}) => {
		const ctx = compileContext();
		const compiled = compileViews(settings.views, ctx);
		const newSources = compiled.sources.filter((spec) => !sources.has(spec.id));
		for (const spec of newSources)
			sources.set(spec.id, {
				spec,
				window: searched ? windowOf(spec.kind) : null,
				failedSince: null,
				error: null
			});
		for (const view of settings.views)
			views.set(view.id, { ...(views.get(view.id) ?? NO_VIEW_STATE), scope: viewScope(view, ctx) });
		save({
			config: true,
			items: [...items.keys()],
			sources: newSources.map((spec) => spec.id),
			views: settings.views.map((view) => view.id)
		});
	};

	const updateItem = (id: ItemId, change: (item: Item) => void) => {
		const item = items.get(id)!;
		change(item);
		item.revision++;
		save({ items: [id] });
	};

	const updateFacts = (id: ItemId, change: Partial<SubjectFacts>) =>
		updateItem(id, (item) => Object.assign(item.facts, change));

	const sourceOf = (kind: DashKind, viewId = VIEW.id) => {
		const view = settings.views.find((v) => v.id === viewId)!;
		const compiled = compileViews([view], compileContext());
		return compiled.sources.find((spec) => spec.kind === kind)!.id;
	};

	const updateSource = (kind: DashKind, change: (source: Source) => void, viewId = VIEW.id) => {
		const id = sourceOf(kind, viewId);
		change(sources.get(id)!);
		save({ sources: [id] });
	};

	const updateView = (id: string, change: (state: ViewState) => void) => {
		change(views.get(id)!);
		save({ views: [id] });
	};

	saveSettings();

	const writes = vi.fn();
	const { ctx, storage, values, queries, settingsWrites } = doState(raw, writes);
	const workspace = new Workspace(ctx, {} as Env);
	const principal = { userId, login: ME };
	const reader = vi.fn(() => workspace.savedViewsSnapshot(principal));
	const tools = createSavedViewTools(() => reader());
	return {
		db: raw.db,
		ctx,
		storage,
		values,
		writes,
		settingsWrites,
		queries,
		workspace,
		principal,
		reader,
		tools,
		subjects,
		items,
		sources,
		views,
		config,
		settings,
		saveSettings,
		updateItem,
		updateFacts,
		updateSource,
		updateView,
		storedSettings: () => seed.load()!.config.settings,
		setNow: (value: number) => vi.setSystemTime(value)
	};
}
