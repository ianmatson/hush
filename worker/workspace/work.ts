import { DAY_MS, HOUR_MS, MINUTE_MS } from '../../src/lib/shared/durations';
import type { DeliveryState } from '../../src/lib/shared/push-policy';
import type { ItemId } from '../../src/lib/model/types';

export const NOTIFICATIONS_ACTIVE_MS = 5 * MINUTE_MS;
export const NOTIFICATIONS_IDLE_MS = 15 * MINUTE_MS;
export const ACTIVE_WINDOW_MS = 15 * MINUTE_MS;
export const SOURCE_EVERY_MS = 15 * MINUTE_MS;
export const SAFETY_READ_EVERY_MS = HOUR_MS;
export const RUNNING_CI_READ_EVERY_MS = 5 * MINUTE_MS;
export const DISCOVERY_GAP_MS = 5 * MINUTE_MS;
export const SAFETY_READ_SLACK_MS = 10 * MINUTE_MS;
export const CLEANUP_EVERY_MS = DAY_MS;
export const PROJECTS_EVERY_MS = 15 * MINUTE_MS;
export const TEAMS_EVERY_MS = 6 * HOUR_MS;
export const TEAMS_RETRY_MS = 10 * MINUTE_MS;
export const PAUSE_AFTER_NO_PUSH_MS = 14 * DAY_MS;
export const PAUSE_AFTER_WITH_PUSH_MS = 90 * DAY_MS;
export const READ_BATCH = 40;
export const SOURCE_BATCH = 10;
export const MAX_PENDING_READS = 500;
export const MAX_READ_ATTEMPTS = 5;
export const READ_RETRY_BASE_MS = MINUTE_MS;
export const READ_RETRY_MAX_MS = 30 * MINUTE_MS;
export const MAX_NOTIFICATION_VERSIONS = 1000;
export const MAX_ANALYSIS_QUEUE = 200;
export const ALERT_HISTORY_MS = 30 * DAY_MS;
export const MAX_INDIVIDUAL_PUSHES = 3;
export const ANALYSIS_BATCH = 12;
export const ANALYSIS_RETRY_MS = 5 * MINUTE_MS;
export const ROUTES_RETRY_MS = 5 * MINUTE_MS;

export type Lifecycle = 'active' | 'paused' | 'stopped';
export type ReadPriority = 'interactive' | 'background';
export type Resource = 'github' | 'ai';

export interface ReadRequest {
	priority: ReadPriority;
	version: number;
	attempts: number;
	notBefore: number;
	interactiveVersion?: number;
}

export type ReadClaims = Record<ItemId, number>;

export interface NotificationCursor {
	dueAt: number;
	lastPollAt: number | null;
	lastModified: string | null;
	pollIntervalMs: number;
	initialized: boolean;
	versions: Record<string, string>;
}

export interface Sync {
	generation: number;
	lifecycle: Lifecycle;
	lastActive: number;
	hasPush: boolean;
	notifications: NotificationCursor;
	sourcesDue: Record<string, number>;
	projectReadAt: Record<ItemId, number>;
	quietReads: ItemId[];
	projectsDue: number;
	teamsDue: number;
	discoveryAt: number;
	reads: Record<ItemId, ReadRequest>;
	readSeq: number;
	readAt: Record<ItemId, number>;
	analysis: ItemId[];
	boundaryAt: number | null;
	cleanupAt: number;
	retryAt: Record<Resource, number>;
	deliveryDue: number | null;
	routesDue: number | null;
	lastWebhookAt: number | null;
	delivery: DeliveryState;
	appSeenAt: number;
	focusedUntil: number;
	analysisUsage: { day: string; tokens: number };
	lastError: string | null;
}

export interface Plan {
	delivery: boolean;
	notifications: boolean;
	teams: boolean;
	projects: boolean;
	sources: string[];
	reads: ItemId[];
	analysis: ItemId[];
	boundary: boolean;
	cleanup: boolean;
	routes: boolean;
}

export interface Interest {
	ids: ReadonlySet<ItemId>;
	ciRunning: ReadonlySet<ItemId>;
}

export function initialSync(now: number): Sync {
	return {
		generation: 1,
		lifecycle: 'active',
		lastActive: now,
		hasPush: false,
		notifications: {
			dueAt: now,
			lastPollAt: null,
			lastModified: null,
			pollIntervalMs: 60_000,
			initialized: false,
			versions: {}
		},
		sourcesDue: {},
		projectReadAt: {},
		quietReads: [],
		projectsDue: now,
		teamsDue: now,
		discoveryAt: 0,
		reads: {},
		readSeq: 0,
		readAt: {},
		analysis: [],
		boundaryAt: null,
		cleanupAt: now + CLEANUP_EVERY_MS,
		retryAt: { github: 0, ai: 0 },
		deliveryDue: null,
		routesDue: null,
		lastWebhookAt: null,
		delivery: { recentSends: [], lastDigestAt: 0 },
		appSeenAt: 0,
		focusedUntil: 0,
		analysisUsage: { day: '', tokens: 0 },
		lastError: null
	};
}

const isActive = (sync: Sync, now: number) =>
	sync.hasPush || now - sync.lastActive < ACTIVE_WINDOW_MS;

export const notificationGap = (sync: Sync, now: number) =>
	Math.max(
		sync.notifications.pollIntervalMs,
		isActive(sync, now) ? NOTIFICATIONS_ACTIVE_MS : NOTIFICATIONS_IDLE_MS
	);

export function safetyReadDue(sync: Sync, id: ItemId, interest: Interest): number {
	const every = interest.ciRunning.has(id) ? RUNNING_CI_READ_EVERY_MS : SAFETY_READ_EVERY_MS;
	return (sync.readAt[id] ?? 0) + every;
}

const earliest = (values: (number | null | undefined)[]) =>
	values.reduce<number | null>(
		(soonest, value) =>
			value === null || value === undefined
				? soonest
				: soonest === null
					? value
					: Math.min(soonest, value),
		null
	);

function githubDue(sync: Sync, interest: Interest): number | null {
	const due = earliest([
		sync.notifications.dueAt,
		sync.teamsDue,
		sync.projectsDue,
		...Object.values(sync.sourcesDue),
		...Object.values(sync.reads).map((request) => request.notBefore),
		...[...interest.ids]
			.filter((id) => !(id in sync.reads))
			.map((id) => safetyReadDue(sync, id, interest))
	]);
	return due === null ? null : Math.max(due, sync.retryAt.github);
}

export function nextWake(sync: Sync, interest: Interest): number | null {
	if (sync.lifecycle !== 'active') return null;
	const analysisDue = sync.analysis.length ? sync.retryAt.ai : null;
	return earliest([
		githubDue(sync, interest),
		analysisDue,
		sync.boundaryAt,
		sync.cleanupAt,
		sync.deliveryDue,
		sync.routesDue
	]);
}

export function planRun(sync: Sync, interest: Interest, now: number): Plan {
	const none: Plan = {
		delivery: false,
		notifications: false,
		teams: false,
		projects: false,
		sources: [],
		reads: [],
		analysis: [],
		boundary: false,
		cleanup: false,
		routes: false
	};
	if (sync.lifecycle !== 'active') return none;
	const github = githubOpen(sync, now);
	const ready = (priority: ReadPriority) =>
		Object.entries(sync.reads)
			.filter(([, request]) => request.priority === priority && request.notBefore <= now)
			.map(([id]) => id);
	const interactive = ready('interactive');
	const background = ready('background');
	const safety = [...interest.ids]
		.filter((id) => !(id in sync.reads))
		.map((id) => [id, safetyReadDue(sync, id, interest)] as const)
		.filter(([id, due]) => due <= now + (interest.ciRunning.has(id) ? 0 : SAFETY_READ_SLACK_MS))
		.sort(([, a], [, b]) => a - b)
		.map(([id]) => id);
	return {
		delivery: sync.deliveryDue !== null && sync.deliveryDue <= now,
		notifications: github && sync.notifications.dueAt <= now,
		teams: github && sync.teamsDue <= now,
		projects: github && sync.projectsDue <= now,
		sources: github
			? Object.entries(sync.sourcesDue)
					.filter(([, due]) => due <= now)
					.sort(([, a], [, b]) => a - b)
					.slice(0, SOURCE_BATCH)
					.map(([id]) => id)
			: [],
		reads: github ? [...interactive, ...background, ...safety].slice(0, READ_BATCH) : [],
		analysis: now >= sync.retryAt.ai ? sync.analysis.slice(0, ANALYSIS_BATCH) : [],
		boundary: sync.boundaryAt !== null && sync.boundaryAt <= now,
		cleanup: sync.cleanupAt <= now,
		routes: sync.routesDue !== null && sync.routesDue <= now
	};
}

export function withSources(sync: Sync, sourceIds: Iterable<string>, now: number): Sync {
	const wanted = new Set(sourceIds);
	const sourcesDue = Object.fromEntries([...wanted].map((id) => [id, sync.sourcesDue[id] ?? now]));
	return { ...sync, sourcesDue };
}

export const githubOpen = (sync: Sync, now: number) => now >= sync.retryAt.github;

function withReads(
	sync: Sync,
	ids: Iterable<ItemId>,
	next: (current: ReadRequest | undefined, version: number) => ReadRequest
): Sync {
	const reads = { ...sync.reads };
	let readSeq = sync.readSeq;
	for (const id of ids) reads[id] = next(reads[id], ++readSeq);
	const bounded = Object.entries(reads)
		.sort(([, a], [, b]) => a.version - b.version)
		.slice(-MAX_PENDING_READS);
	return { ...sync, reads: Object.fromEntries(bounded), readSeq };
}

export const requestReads = (
	sync: Sync,
	ids: Iterable<ItemId>,
	priority: ReadPriority,
	now: number
): Sync =>
	withReads(sync, ids, (current, version) => ({
		priority: current?.priority === 'interactive' ? 'interactive' : priority,
		version,
		attempts: 0,
		notBefore: now,
		interactiveVersion: priority === 'interactive' ? version : current?.interactiveVersion
	}));

export const renewReads = (sync: Sync, ids: Iterable<ItemId>, now: number): Sync =>
	withReads(sync, ids, (current, version) =>
		current
			? { ...current, version }
			: { priority: 'background', version, attempts: 0, notBefore: now }
	);

export const claimReads = (sync: Sync, ids: ItemId[]): ReadClaims =>
	Object.fromEntries(ids.map((id) => [id, sync.reads[id]?.version ?? 0]));

export function readsDone(sync: Sync, claims: ReadClaims, now: number): Sync {
	const reads = { ...sync.reads };
	const readAt = { ...sync.readAt };
	for (const [id, version] of Object.entries(claims)) {
		readAt[id] = now;
		if ((reads[id]?.version ?? 0) === version) delete reads[id];
	}
	const quietReads = sync.quietReads.filter((id) => !(id in claims));
	return { ...sync, reads, readAt, quietReads };
}

export const readRetryDelay = (attempts: number) =>
	Math.min(READ_RETRY_BASE_MS * 2 ** (attempts - 1), READ_RETRY_MAX_MS);

export function readsFailed(sync: Sync, claims: ReadClaims, now: number): Sync {
	const reads = { ...sync.reads };
	const readAt = { ...sync.readAt };
	for (const [id, version] of Object.entries(claims)) {
		const current = reads[id];
		if ((current?.interactiveVersion ?? 0) > version) continue;
		const attempts = (current?.attempts ?? 0) + 1;
		if (attempts >= MAX_READ_ATTEMPTS) {
			delete reads[id];
			readAt[id] = now;
			continue;
		}
		reads[id] = {
			priority: current?.priority ?? 'background',
			version: current?.version ?? version,
			attempts,
			notBefore: now + readRetryDelay(attempts)
		};
	}
	return { ...sync, reads, readAt };
}

export function forgetReads(
	sync: Sync,
	pending: ReadonlySet<ItemId>,
	stored: ReadonlySet<ItemId>
): Sync {
	const kept = <T>(record: Record<ItemId, T>, keep: ReadonlySet<ItemId>) =>
		Object.fromEntries(Object.entries(record).filter(([id]) => keep.has(id)));
	return { ...sync, reads: kept(sync.reads, pending), readAt: kept(sync.readAt, stored) };
}

export function sourcesRan(sync: Sync, ids: Iterable<string>, now: number): Sync {
	const sourcesDue = { ...sync.sourcesDue };
	for (const id of ids) if (id in sourcesDue) sourcesDue[id] = now + SOURCE_EVERY_MS;
	return { ...sync, sourcesDue };
}

export function bringDiscoveryForward(sync: Sync, sourceIds: Iterable<string>, now: number): Sync {
	if (now - sync.discoveryAt < DISCOVERY_GAP_MS) return sync;
	const sourcesDue = { ...sync.sourcesDue };
	for (const id of sourceIds) if (id in sourcesDue) sourcesDue[id] = Math.min(sourcesDue[id], now);
	return { ...sync, sourcesDue, discoveryAt: now };
}

export function notificationsPolled(
	sync: Sync,
	now: number,
	cursor: Partial<Pick<NotificationCursor, 'lastModified' | 'pollIntervalMs' | 'versions'>>
): Sync {
	const versions = { ...sync.notifications.versions, ...cursor.versions };
	const bounded = Object.fromEntries(Object.entries(versions).slice(-MAX_NOTIFICATION_VERSIONS));
	const notifications: NotificationCursor = {
		...sync.notifications,
		...cursor,
		versions: bounded,
		lastPollAt: now,
		initialized: true
	};
	const next = { ...sync, notifications };
	return {
		...next,
		notifications: { ...notifications, dueAt: now + notificationGap(next, now) }
	};
}

export function rateLimited(sync: Sync, resource: Resource, until: number, error: string): Sync {
	return {
		...sync,
		retryAt: { ...sync.retryAt, [resource]: Math.max(sync.retryAt[resource], until) },
		lastError: error
	};
}

export function touched(sync: Sync, now: number): Sync {
	if (sync.lifecycle === 'stopped') return sync;
	const resumed = sync.lifecycle === 'paused';
	const lastPollAt = sync.notifications.lastPollAt ?? 0;
	return {
		...sync,
		lifecycle: 'active',
		generation: resumed ? sync.generation + 1 : sync.generation,
		lastActive: now,
		notifications: {
			...sync.notifications,
			dueAt: Math.min(sync.notifications.dueAt, Math.max(now, lastPollAt + NOTIFICATIONS_ACTIVE_MS))
		}
	};
}

export function pausedIfIdle(sync: Sync, now: number): Sync {
	if (sync.lifecycle !== 'active') return sync;
	const limit = sync.hasPush ? PAUSE_AFTER_WITH_PUSH_MS : PAUSE_AFTER_NO_PUSH_MS;
	if (now - sync.lastActive < limit) return sync;
	return { ...sync, lifecycle: 'paused', generation: sync.generation + 1, reads: {}, analysis: [] };
}

export function stopped(sync: Sync, error: string): Sync {
	return {
		...sync,
		lifecycle: 'stopped',
		generation: sync.generation + 1,
		reads: {},
		analysis: [],
		lastError: error
	};
}

export const restarted = (sync: Sync): Sync => ({
	...sync,
	lifecycle: 'active',
	generation: sync.generation + 1,
	reads: {},
	analysis: [],
	lastError: null
});

export const cleanedUp = (sync: Sync, now: number): Sync => ({
	...sync,
	cleanupAt: now + CLEANUP_EVERY_MS
});

export const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);

export const nextUtcDay = (now: number) => Math.floor(now / DAY_MS) * DAY_MS + DAY_MS;

export function analysisSpent(sync: Sync, now: number): number {
	return sync.analysisUsage.day === utcDay(now) ? sync.analysisUsage.tokens : 0;
}

export function analysisUsed(sync: Sync, tokens: number, now: number): Sync {
	return {
		...sync,
		analysisUsage: { day: utcDay(now), tokens: analysisSpent(sync, now) + tokens }
	};
}
