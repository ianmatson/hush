import { DatabaseSync } from 'node:sqlite';
import { vi } from 'vitest';
import { finishItem } from '../../src/lib/shared/dashboard';
import { DEFAULT_SETTINGS } from '../../src/lib/shared/settings';
import { dashFactsOf, subjectKey } from '../../src/lib/shared/subject';
import type { DashResponse, ItemView } from '../../src/lib/shared/types';
import { createSnapshotReader, type SnapshotStorage } from '../assistant/snapshot';
import { createSavedViewTools } from '../assistant/tools';
import { dashSignature } from '../poller/dashboard-cache';
import { SCHEMA, SCHEMA_VERSION } from '../poller/schema';
import { subjectFixture } from './subject-fixtures';

export const NOW = Date.parse('2026-10-21T10:00:00Z');
export const VIEW: ItemView = {
	id: 'mine',
	name: 'Mine',
	searches: ['repo:sandbox/web is:open'],
	groupBy: 'role'
};

export function assistantFixture(userId = 1) {
	const settings = structuredClone(DEFAULT_SETTINGS);
	settings.views = [structuredClone(VIEW)];
	const subjects = [
		subjectFixture({
			number: 1,
			author: 'reviewer',
			title: 'Zulu',
			createdAt: new Date(NOW).toISOString()
		}),
		subjectFixture({
			number: 2,
			reviewRequests: [{ name: 'reviewer', team: false }],
			title: 'Alpha'
		}),
		subjectFixture({ number: 3, kind: 'issue', assignees: ['reviewer'], title: 'Beta' }),
		subjectFixture({ number: 4, title: 'Hidden' })
	];
	for (const subject of subjects) {
		subject.updatedAt = new Date(NOW).toISOString();
		subject.createdAt = new Date(NOW).toISOString();
		subject.lastCommitAt = new Date(NOW).toISOString();
	}
	const items = subjects.map((subject) => ({
		...finishItem(
			dashFactsOf(subject, 'reviewer', new Set()),
			['mine'],
			['Mine'],
			'reviewer',
			14,
			NOW
		),
		sourceFilters: { mine: ['author:reviewer'] },
		sourceQueries: ['server-only']
	}));
	items[3].sections = ['another-view'];
	const data = (kind: DashResponse['kind']): DashResponse => ({
		kind,
		items: items.filter((item) => item.kind === kind),
		sourceItems: [],
		sections: [{ id: 'mine', name: 'Mine', count: 3 }],
		teams: [],
		fetchedAt: NOW,
		errors: []
	});
	const pr = data('pr');
	const issue = data('issue');
	const values = new Map<string, unknown>([
		['userId', userId],
		['schema', SCHEMA_VERSION],
		['settings', JSON.stringify(settings)],
		['dash:pr', { sig: dashSignature('pr', settings), data: pr }],
		['dash:issue', { sig: dashSignature('issue', settings), data: issue }],
		['lastActive', NOW - 1_000_000],
		['paused', true]
	]);
	const db = new DatabaseSync(':memory:');
	db.exec(SCHEMA);
	for (const subject of subjects)
		db.prepare('INSERT INTO subjects (key, facts, changed_at) VALUES (?, ?, ?)').run(
			subjectKey(subject.repo, subject.number),
			JSON.stringify(subject),
			NOW
		);
	const writes = vi.fn(() => {
		throw new Error('Unexpected write');
	});
	const queries: string[] = [];
	const storage: SnapshotStorage = {
		get: vi.fn(
			async (keys: string[]) => new Map(keys.map((key) => [key, structuredClone(values.get(key))]))
		),
		sql: {
			exec: ((query: string, ...args: (string | number | null)[]) => {
				queries.push(query);
				if (!query.startsWith('SELECT ')) throw new Error('Unexpected SQL write');
				return { toArray: () => db.prepare(query).all(...args) };
			}) as SnapshotStorage['sql']['exec']
		}
	};
	Object.assign(storage, {
		put: writes,
		delete: writes,
		deleteAll: writes,
		setAlarm: writes,
		deleteAlarm: writes
	});
	let now = NOW;
	const reader = createSnapshotReader(storage, { userId, login: 'reviewer' });
	const tools = createSavedViewTools(() => reader(now));
	const saveSettings = () => {
		values.set('settings', JSON.stringify(settings));
		for (const kind of ['pr', 'issue'] as const) {
			const cached = values.get(`dash:${kind}`) as { sig: string };
			if (cached) cached.sig = dashSignature(kind, settings);
		}
	};
	return {
		db,
		values,
		writes,
		queries,
		storage,
		reader,
		tools,
		subjects,
		items,
		pr,
		issue,
		settings,
		saveSettings,
		setNow: (value: number) => {
			now = value;
		}
	};
}
