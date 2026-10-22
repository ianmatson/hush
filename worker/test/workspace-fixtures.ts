import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_SETTINGS } from '../../src/lib/shared/settings';
import type { SubjectFacts } from '../../src/lib/shared/subject';
import type { ItemView, Settings, TeamDTO } from '../../src/lib/shared/types';
import { ANALYSIS_VERSION, EFFORT, ME, NOW } from '../../src/lib/model/testing';
import type { ItemId, SourceSpec, SourceWindow } from '../../src/lib/model/types';
import type { Config } from '../workspace/commit';
import { WorkspaceStore, type SqlStorage, type SqlValue } from '../workspace/store';
import type {
	ItemsResult,
	NotificationsResult,
	ProjectStatuses,
	Readers,
	SourcesResult,
	WorkspaceDeps
} from '../workspace/workspace';

export function memoryStorage(): SqlStorage & { db: DatabaseSync } {
	const db = new DatabaseSync(':memory:');
	return {
		db,
		sql: {
			exec(query: string, ...bindings: SqlValue[]) {
				const statements = query.split(';').filter((part) => part.trim());
				if (statements.length > 1) {
					db.exec(query);
					return { toArray: () => [] };
				}
				const rows = db.prepare(query).all(...bindings);
				return { toArray: () => rows as never[] };
			}
		} as SqlStorage['sql'],
		transactionSync<T>(work: () => T): T {
			db.exec('BEGIN');
			try {
				const result = work();
				db.exec('COMMIT');
				return result;
			} catch (error) {
				db.exec('ROLLBACK');
				throw error;
			}
		}
	};
}

export function settingsWith(views: ItemView[], over: Partial<Settings> = {}): Settings {
	return {
		...DEFAULT_SETTINGS,
		categoryGroups: [EFFORT],
		pushFacts: ['review-requested', 'snooze-over', 'ci-failed'],
		views,
		...over
	};
}

export const configWith = (settings: Settings): Config => ({
	me: ME,
	settings,
	teams: [],
	projectAccess: 'none',
	analysisVersion: ANALYSIS_VERSION,
	projects: []
});

export const windowOf = (ids: ItemId[], at = NOW): SourceWindow => ({
	candidates: ids.map((id) => ({ id, updatedAt: new Date(at).toISOString() })),
	truncated: false
});

export class FakeReaders implements Readers {
	notificationResults: NotificationsResult[] = [];
	sourceResults: ((specs: SourceSpec[]) => SourcesResult)[] = [];
	facts = new Map<ItemId, SubjectFacts>();
	itemCalls: ItemId[][] = [];
	beforeItemsAnswer: (() => void) | null = null;
	analyze?: Readers['analyze'];

	async notifications(): Promise<NotificationsResult> {
		return this.notificationResults.shift() ?? { status: 'not-modified', pollIntervalMs: 60_000 };
	}

	sourceCalls = 0;

	async sources(specs: SourceSpec[]): Promise<SourcesResult> {
		this.sourceCalls++;
		const next = this.sourceResults.shift();
		return next ? next(specs) : { reads: new Map() };
	}

	teamsResult: TeamDTO[] | null = [];
	projectStatuses: ProjectStatuses = {
		statusOf: new Map(),
		incomplete: new Set(),
		definitions: []
	};
	projectCalls: ItemId[][] = [];

	async teams(): Promise<TeamDTO[] | null> {
		return this.teamsResult;
	}

	async projects(ids: ItemId[]): Promise<ProjectStatuses> {
		this.projectCalls.push(ids);
		return this.projectStatuses;
	}

	async items(ids: ItemId[]): Promise<ItemsResult> {
		this.itemCalls.push(ids);
		this.beforeItemsAnswer?.();
		return {
			read: ids.flatMap((id) => this.facts.get(id) ?? []),
			inaccessible: [],
			failed: ids.filter((id) => !this.facts.has(id))
		};
	}
}

export function harness() {
	const storage = memoryStorage();
	const store = new WorkspaceStore(storage);
	store.migrate();
	const readers = new FakeReaders();
	const alarms: (number | null)[] = [];
	const announced: { revision: number; viewIds: string[] }[] = [];
	let rejected = 0;
	let now = NOW;
	const deps: WorkspaceDeps = {
		store,
		readers,
		analysisBudget: 1_000_000,
		setAlarm: (at) => void alarms.push(at),
		announce: (revision, viewIds) => void announced.push({ revision, viewIds }),
		credentialRejected: () => void rejected++
	};
	return {
		storage,
		store,
		readers,
		deps,
		alarms,
		announced,
		rejectedCount: () => rejected,
		clock: () => now,
		advance: (ms: number) => void (now += ms)
	};
}
