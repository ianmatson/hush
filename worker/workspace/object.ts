import { DurableObject } from 'cloudflare:workers';
import type { CategoryPin } from '../../src/lib/shared/categories';
import { allCategories, pinsAfter } from '../../src/lib/shared/categories';
import type { Snapshot } from '../../src/lib/shared/changes';
import { expandSections } from '../../src/lib/shared/dashboard';
import {
	MAX_SOURCE_COUNT_SEARCHES,
	searchKinds,
	sectionsFor,
	type SourceCount
} from '../../src/lib/shared/item-views';
import { MENUS_VERSION } from '../../src/lib/shared/menus';
import { boardQueryOf, projectAccessOf } from '../../src/lib/shared/projects';
import {
	APP_BLUR_MESSAGE,
	APP_FOCUS_LASTS_MS,
	APP_FOCUS_MESSAGE,
	MAX_PUSH_DEVICES
} from '../../src/lib/shared/push-policy';
import { DEFAULT_SETTINGS, parseSettings } from '../../src/lib/shared/settings';
import { mergeSettings, validateSettings } from '../../src/lib/shared/settings-schema';
import type { SnoozeChoice } from '../../src/lib/shared/item-snooze';
import { SNOOZE_EVENT_MAX_MS } from '../../src/lib/shared/snooze';
import type {
	AlertDTO,
	DashKind,
	ItemView,
	LiveMessage,
	Settings,
	TeamDTO
} from '../../src/lib/shared/types';
import {
	authorizationJson,
	legacyFingerprintView,
	settingsAuthorization,
	type LegacyViewFingerprints
} from '../../src/lib/shared/view-authorization';
import { compileViews } from '../../src/lib/model/compile';
import { createEvaluator } from '../../src/lib/model/evaluate';
import { presentItems, type ItemsResponse, type ViewRow } from '../../src/lib/model/present';
import { parseCategoryFeed, parseViewFeed } from '../../src/lib/shared/views';
import { itemFeedEntry, type FeedEntry } from '../feed-entries';
import {
	SnapshotUnavailable,
	type SavedViewsSnapshot,
	type SnapshotPrincipal
} from '../assistant/snapshot';
import type { ItemId, Snooze } from '../../src/lib/model/types';
import { getUser, scopesOf, userToken, type Env } from '../db';
import { dailyTokenBudget } from '../decide';
import { searchCounts } from '../github';
import { boardCount } from '../projects';
import { sendSlackAlerts } from '../slack-alerts';
import { slackConnection } from '../slack-store';
import { slackIsConfigured } from '../slack';
import { sendPush, vapidFromEnv, type PushMessage } from '../webpush';
import type { Command, Config, WorkspaceData } from './commit';
import { WorkspaceEngine, type Channel, type Sender, type WorkspaceDeps } from './engine';
import { githubReaders, modelAnalyzer, type Credential } from './readers';
import { WorkspaceStore, type ChannelOutcome, type SqlStorage } from './store';

export const ANALYSIS_VERSION = 'questions-v1';
const ACCOUNT_KEY = 'account';
const DEVICES_KEY = 'pushDevices';
const ACCESS_VERSION_KEY = 'mcpAccessVersion';
const LEGACY_FINGERPRINTS_KEY = 'mcpLegacyViewFingerprints';
const ALERT_HISTORY_SHOWN = 100;
const MAX_MARKS = 50;
const FEED_ENTRIES = 50;

export interface PollStatus {
	lastPollAt: number | null;
	lastError: string | null;
	nextPollAt: number | null;
	smartDecisionsPaused: boolean;
	smartDecisionsChecking: boolean;
}

export interface PushDevice {
	endpoint: string;
	p256dh: string;
	auth: string;
	label: string | null;
	createdAt: number;
}

export interface SeenMark {
	itemId: ItemId;
	revision: number;
	baseline: Snapshot;
}

export type Refusal = { error: string; status: 400 | 404 | 500 };

interface Account {
	userId: number;
}

const snoozeOf = (choice: SnoozeChoice, now: number, activityAt: string): Snooze => {
	const id = crypto.randomUUID();
	if (choice.event)
		return { kind: 'event', id, at: now, event: choice.event, until: now + SNOOZE_EVENT_MAX_MS };
	if (choice.until !== undefined) return { kind: 'time', id, at: now, until: choice.until };
	return { kind: 'activity', id, at: now, activityAt };
};

export class Workspace extends DurableObject<Env> {
	private engine: WorkspaceEngine | null = null;
	private running: Promise<void> | null = null;
	private wantedAlarm: number | null | undefined;
	private settingsWrites: Promise<unknown> = Promise.resolve();
	private readonly store: WorkspaceStore;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.store = new WorkspaceStore(ctx.storage as unknown as SqlStorage);
		ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
	}

	private account(): Account | null {
		try {
			return this.store.readState<Account>(ACCOUNT_KEY);
		} catch {
			return null;
		}
	}

	private async credential(): Promise<Credential> {
		const account = this.account();
		const user = account ? await getUser(this.env, account.userId) : null;
		if (!user) throw new Error('Not signed in.');
		return { token: await userToken(this.env, user), me: user.login };
	}

	private devices(): PushDevice[] {
		return this.store.readState<PushDevice[]>(DEVICES_KEY) ?? [];
	}

	private sender(): Sender {
		return {
			channels: async () => {
				const settings = this.engine?.snapshot.config.settings;
				const userId = this.account()?.userId;
				const channels: Channel[] = [];
				if (settings?.alertChannels.push && this.devices().length && this.env.VAPID_PRIVATE_KEY)
					channels.push('push');
				if (
					settings?.alertChannels.slack &&
					userId &&
					slackIsConfigured(this.env) &&
					(await slackConnection(this.env, userId))
				)
					channels.push('slack');
				return channels;
			},
			send: async (message, channels) => {
				const outcomes = {} as Record<Channel, ChannelOutcome>;
				if (channels.includes('push'))
					outcomes.push = (await this.sendPush(message)) ? 'sent' : 'failed';
				if (channels.includes('slack')) {
					const userId = this.account()?.userId;
					const sent = userId
						? await sendSlackAlerts(this.env, userId, [message], this.env.APP_URL)
						: false;
					outcomes.slack = sent ? 'sent' : 'failed';
				}
				return outcomes;
			}
		};
	}

	private async sendPush(message: PushMessage): Promise<boolean> {
		const devices = this.devices();
		if (!devices.length || !this.env.VAPID_PRIVATE_KEY) return false;
		const vapid = vapidFromEnv(this.env, this.env.APP_URL);
		const gone = new Set<string>();
		let accepted = 0;
		for (const device of devices) {
			const status = await sendPush(device, message, vapid, 'high').catch(() => 0);
			if (status >= 200 && status < 300) accepted++;
			if (status === 404 || status === 410) gone.add(device.endpoint);
		}
		if (gone.size)
			this.store.writeState(
				DEVICES_KEY,
				devices.filter((device) => !gone.has(device.endpoint))
			);
		return accepted > 0;
	}

	private deps(): WorkspaceDeps {
		return {
			store: this.store,
			readers: { ...githubReaders(() => this.credential()), analyze: modelAnalyzer(this.env) },
			sender: this.sender(),
			origin: this.env.APP_URL,
			analysisBudget: dailyTokenBudget(this.env),
			setAlarm: (at) => {
				this.wantedAlarm = at;
			},
			announce: (revision, views) => this.broadcast({ type: 'items', revision, views }),
			announceAlerts: () => this.broadcast({ type: 'alerts' }),
			credentialRejected: () => {
				const account = this.account();
				if (account)
					this.ctx.waitUntil(
						this.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(account.userId).run()
					);
			}
		};
	}

	private open(): WorkspaceEngine | null {
		if (this.engine && !this.engine.broken) return this.engine;
		this.store.migrate();
		this.engine = WorkspaceEngine.open(this.deps(), Date.now());
		return this.engine;
	}

	private async active(): Promise<WorkspaceEngine> {
		const engine = this.open();
		if (engine) return engine;
		const userId = Number(this.ctx.id.name);
		if (!Number.isInteger(userId)) throw new Error('Not signed in.');
		await this.start(userId);
		return this.open()!;
	}

	private async settle() {
		const at = this.wantedAlarm;
		if (at === undefined) return;
		this.wantedAlarm = undefined;
		if (at === null) await this.ctx.storage.deleteAlarm();
		else if ((await this.ctx.storage.getAlarm()) !== at) await this.ctx.storage.setAlarm(at);
	}

	private broadcast(message: LiveMessage) {
		const text = JSON.stringify(message);
		for (const socket of this.ctx.getWebSockets())
			try {
				socket.send(text);
			} catch {
				continue;
			}
	}

	private runNow(): Promise<void> {
		this.running ??= (async () => {
			try {
				this.broadcast({ type: 'syncing', on: true });
				await (await this.active()).run(Date.now);
			} catch (error) {
				console.error('workspace run failed', (error as Error).message);
			} finally {
				this.running = null;
				this.broadcast({ type: 'syncing', on: false });
				this.broadcastStatus();
				await this.settle();
			}
		})();
		return this.running;
	}

	private broadcastStatus() {
		if (!this.ctx.getWebSockets().length || !this.engine) return;
		const status = this.statusOf(this.engine);
		this.broadcast({
			type: 'status',
			lastPollAt: status.lastPollAt,
			nextPollAt: status.nextPollAt,
			lastPollError: status.lastError
		});
	}

	private async legacySettings(userId: number): Promise<Settings> {
		const legacy = this.env.POLLER.get(this.env.POLLER.idFromName(String(userId)));
		const saved = await legacy.exportSettings().catch(() => null);
		return saved ? parseSettings(saved) : structuredClone(DEFAULT_SETTINGS);
	}

	async start(userId: number): Promise<void> {
		const user = await getUser(this.env, userId);
		if (!user) throw new Error('Not signed in.');
		this.store.migrate();
		this.store.writeState(ACCOUNT_KEY, { userId } satisfies Account);
		const projectAccess = projectAccessOf(scopesOf(user));
		const engine = this.open();
		if (!engine) {
			const config: Config = {
				me: user.login,
				settings: await this.legacySettings(userId),
				teams: [],
				projectAccess,
				analysisVersion: ANALYSIS_VERSION,
				projects: []
			};
			this.engine = WorkspaceEngine.create(this.deps(), config, Date.now());
		} else engine.apply({ kind: 'account', me: user.login, projectAccess }, Date.now());
		(await this.active()).touch(Date.now());
		await this.settle();
	}

	async stop(): Promise<void> {
		this.engine = null;
		await this.ctx.storage.deleteAlarm();
		await this.ctx.storage.deleteAll();
	}

	async touch(): Promise<void> {
		(await this.active()).touch(Date.now());
		await this.settle();
	}

	async alarm(): Promise<void> {
		if (!this.open()) return;
		await this.runNow();
	}

	async pollNow(): Promise<PollStatus> {
		(await this.active()).touch(Date.now());
		(await this.active()).refreshEverything(Date.now());
		await this.runNow();
		return this.statusOf(await this.active());
	}

	private statusOf(engine: WorkspaceEngine): PollStatus {
		const sync = engine.schedule;
		const now = Date.now();
		return {
			lastPollAt: sync.notifications.lastPollAt,
			lastError: sync.lastError,
			nextPollAt: sync.lifecycle === 'active' ? sync.notifications.dueAt : null,
			smartDecisionsPaused:
				sync.retryAt.ai > now && sync.analysisUsage.tokens >= dailyTokenBudget(this.env),
			smartDecisionsChecking: sync.analysis.length > 0
		};
	}

	async me(): Promise<{ settings: Settings; status: PollStatus }> {
		const engine = await this.active();
		engine.touch(Date.now());
		await this.settle();
		return { settings: engine.snapshot.config.settings, status: this.statusOf(engine) };
	}

	async items(): Promise<ItemsResponse> {
		return this.present((await this.active()).snapshot, Date.now());
	}

	private present(data: WorkspaceData, now: number): ItemsResponse {
		const { config } = data;
		const ctx = {
			dash: config.settings.dash,
			categoryGroups: config.settings.categoryGroups,
			smartDecisions: config.settings.smartDecisions,
			teams: config.teams,
			analysisVersion: config.analysisVersion,
			now
		};
		const views = compileViews(config.settings.views, ctx).views;
		const evaluator = createEvaluator({
			...ctx,
			me: config.me,
			items: data.items,
			sources: data.sources
		});
		return presentItems({
			revision: data.revision,
			now,
			views,
			states: data.views,
			evaluator,
			projects: config.projects,
			teams: config.teams
		});
	}

	private async command(command: Command): Promise<{ ok: true }> {
		(await this.active()).apply(command, Date.now());
		await this.settle();
		return { ok: true };
	}

	async snooze(itemIds: ItemId[], choice: SnoozeChoice): Promise<{ ok: true }> {
		const engine = await this.active();
		const now = Date.now();
		const commands = itemIds.flatMap((id) => {
			const item = engine.snapshot.items.get(id);
			return item
				? [
						{
							kind: 'snooze' as const,
							itemIds: [id],
							snooze: snoozeOf(choice, now, item.facts.updatedAt)
						}
					]
				: [];
		});
		engine.apply(commands, now);
		return this.settle().then(() => ({ ok: true as const }));
	}

	unsnooze(itemIds: ItemId[]) {
		return this.command({ kind: 'wake', itemIds });
	}

	mute(itemIds: ItemId[], muted = true) {
		return this.command({ kind: 'mute', itemIds, muted });
	}

	async pin(itemIds: ItemId[], pin: CategoryPin): Promise<Refusal | { ok: true }> {
		const groups = (await this.active()).snapshot.config.settings.categoryGroups;
		if (!pinsAfter([], pin, groups)) return { error: 'Unknown category', status: 400 };
		return this.command({ kind: 'pin', itemIds, pin });
	}

	async markSeen(marks: SeenMark[]) {
		const commands: Command[] = marks.slice(0, MAX_MARKS).map((mark) => ({
			kind: 'seen',
			itemId: mark.itemId,
			revision: mark.revision,
			snapshot: mark.baseline
		}));
		(await this.active()).apply(commands, Date.now());
		return this.settle().then(() => ({ ok: true as const }));
	}

	markUnseen(itemIds: ItemId[]) {
		return this.command({ kind: 'unread', itemIds: itemIds.slice(0, MAX_MARKS) });
	}

	async reevaluate(): Promise<{ items: number }> {
		const engine = await this.active();
		engine.apply({ kind: 'forget-analysis' }, Date.now());
		await this.settle();
		return { items: engine.schedule.analysis.length };
	}

	async recheck(repo: string, number: number, nodeId?: string): Promise<{ ok: true }> {
		const engine = await this.active();
		const known = engine.itemAt(repo, number) ?? nodeId;
		if (!known) return { ok: true };
		engine.requestRead([known], 'interactive', Date.now());
		await this.runNow();
		return { ok: true };
	}

	async rebuildBoards(): Promise<void> {
		(await this.active()).refreshBoards(Date.now());
		await this.runNow();
	}

	async teams(refresh = false): Promise<{ teams: TeamDTO[]; error?: string }> {
		const engine = await this.active();
		if (refresh) {
			engine.refreshTeamsSoon(Date.now());
			await this.runNow();
		}
		return { teams: engine.snapshot.config.teams };
	}

	async countSource(query: string): Promise<SourceCount> {
		const { token } = await this.credential();
		const { config } = (await this.active()).snapshot;
		const view: ItemView = { id: 'count', name: '', searches: [query], groupBy: 'none' };
		const searches = searchKinds(query).flatMap((kind: DashKind) =>
			expandSections(sectionsFor(kind, [view]), config.settings.dash, config.teams).queries.map(
				(q) => ({ kind, q: q.q })
			)
		);
		const asked = searches.slice(0, MAX_SOURCE_COUNT_SEARCHES);
		const onBoards = asked.filter((s) => boardQueryOf(s.q));
		const boardCounts = new Map(
			await Promise.all(onBoards.map(async (s) => [s, await boardCount(token, s.q)] as const))
		);
		const searched = await searchCounts(
			token,
			asked.filter((s) => !boardCounts.has(s)).map((s) => s.q)
		);
		const counts = asked.map((s) =>
			boardCounts.has(s) ? boardCounts.get(s)! : (searched.shift() ?? null)
		);
		const out: SourceCount = { pr: null, issue: null };
		asked.forEach((s, k) => (out[s.kind] = (out[s.kind] ?? 0) + (counts[k] ?? 0)));
		return out;
	}

	updateSettings(
		body: Partial<Settings>,
		replace = false
	): Promise<Refusal | { settings: Settings }> {
		const update = this.settingsWrites.then(() => this.applySettings(body, replace));
		this.settingsWrites = update.catch(() => undefined);
		return update;
	}

	private async applySettings(
		body: Partial<Settings>,
		replace: boolean
	): Promise<Refusal | { settings: Settings }> {
		if (typeof body !== 'object' || body === null || Array.isArray(body))
			return { error: 'Settings must be an object.', status: 400 };
		const engine = await this.active();
		const old = engine.snapshot.config.settings;
		const next = mergeSettings(replace ? structuredClone(DEFAULT_SETTINGS) : old, body);
		if (next.menus) next.menus = { ...next.menus, v: MENUS_VERSION };
		const error = validateSettings(next, Object.keys(body));
		if (error) return { error, status: 400 };
		await this.versionAccess(old, next);
		const dropAnswers = old.smartDecisions && !next.smartDecisions;
		engine.apply(
			[
				{ kind: 'settings', settings: next },
				...(dropAnswers ? [{ kind: 'forget-analysis' as const }] : [])
			],
			Date.now()
		);
		this.broadcast({ type: 'settings' });
		await this.settle();
		return { settings: engine.snapshot.config.settings };
	}

	private async versionAccess(old: Settings, next: Settings) {
		const values = await this.ctx.storage.get([ACCESS_VERSION_KEY, LEGACY_FINGERPRINTS_KEY]);
		const changed =
			authorizationJson(settingsAuthorization(old)) !==
			authorizationJson(settingsAuthorization(next));
		const accessVersion =
			changed || !values.get(ACCESS_VERSION_KEY)
				? crypto.randomUUID()
				: (values.get(ACCESS_VERSION_KEY) as string);
		const legacy = values.get(LEGACY_FINGERPRINTS_KEY) as LegacyViewFingerprints | undefined;
		const fingerprints: LegacyViewFingerprints = {
			accessVersion,
			views: changed
				? {}
				: legacy?.accessVersion === accessVersion
					? legacy.views
					: Object.fromEntries(
							await Promise.all(
								old.views.map(async (view) => [view.id, await legacyFingerprintView(view)])
							)
						)
		};
		await this.ctx.storage.put({
			[ACCESS_VERSION_KEY]: accessVersion,
			[LEGACY_FINGERPRINTS_KEY]: fingerprints
		});
	}

	async savedViewsSnapshot(principal: SnapshotPrincipal): Promise<SavedViewsSnapshot> {
		if (this.account()?.userId !== principal.userId)
			throw new SnapshotUnavailable('scope_mismatch');
		let data: WorkspaceData | null;
		try {
			data = this.store.load();
		} catch {
			data = null;
		}
		if (!data) throw new SnapshotUnavailable('schema_not_ready');
		const values = await this.ctx.storage.get([ACCESS_VERSION_KEY, LEGACY_FINGERPRINTS_KEY]);
		return {
			principal: { ...principal },
			accessVersion: (values.get(ACCESS_VERSION_KEY) as string | undefined) ?? 'initial',
			legacyViewFingerprints: values.get(LEGACY_FINGERPRINTS_KEY) as
				LegacyViewFingerprints | undefined,
			views: data.config.settings.views,
			categoryGroups: data.config.settings.categoryGroups,
			items: this.present(data, Date.now())
		};
	}

	feedEntries(feedView: string): { name: string; entries: FeedEntry[] } | null {
		const engine = this.open();
		if (!engine) return null;
		const { settings } = engine.snapshot.config;
		const rows = this.present(engine.snapshot, Date.now()).rows.filter(
			(row) => !row.dismissed && row.views.length > 0
		);
		const entries = (keep: (row: ViewRow) => boolean) =>
			rows
				.filter(keep)
				.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
				.slice(0, FEED_ENTRIES)
				.map(itemFeedEntry);
		const categoryId = parseCategoryFeed(feedView);
		if (categoryId) {
			const category = allCategories(settings.categoryGroups).find((c) => c.id === categoryId);
			return category
				? { name: category.name, entries: entries((row) => !!row.categories?.includes(categoryId)) }
				: null;
		}
		const viewId = parseViewFeed(feedView);
		const view = settings.views.find((v) => v.id === viewId);
		return view
			? { name: view.name, entries: entries((row) => row.views.includes(view.id)) }
			: null;
	}

	async alerts(): Promise<AlertDTO[]> {
		const engine = await this.active();
		return this.store
			.alertHistory(ALERT_HISTORY_SHOWN)
			.filter((alert) => alert.delivery.status !== 'superseded')
			.map((alert) => {
				const item = engine.snapshot.items.get(alert.itemId)?.facts;
				return {
					id: alert.id,
					sentAt: alert.createdAt,
					title: alert.title,
					body: alert.body,
					url: alert.url,
					item: item ? { repo: item.repo, number: item.number, kind: item.kind } : null
				};
			});
	}

	async alertChannelsChanged(): Promise<void> {
		(await this.active()).deliverSoon(Date.now());
		await this.settle();
	}

	pushDevices() {
		return this.devices().map((device) => ({
			id: device.endpoint,
			endpoint: device.endpoint,
			label: device.label,
			createdAt: device.createdAt
		}));
	}

	async subscribe(sub: {
		endpoint?: string;
		keys?: { p256dh?: string; auth?: string };
		label?: string;
	}): Promise<Refusal | { ok: true }> {
		const endpoint = sub.endpoint;
		if (!endpoint?.startsWith('https://') || !sub.keys?.p256dh || !sub.keys.auth)
			return { error: 'Invalid push subscription', status: 400 };
		const others = this.devices().filter((device) => device.endpoint !== endpoint);
		if (others.length >= MAX_PUSH_DEVICES)
			return {
				error: `Up to ${MAX_PUSH_DEVICES} devices can get push. Remove one in Settings first.`,
				status: 400
			};
		this.store.writeState(DEVICES_KEY, [
			...others,
			{
				endpoint,
				p256dh: sub.keys.p256dh,
				auth: sub.keys.auth,
				label: sub.label?.slice(0, 80) ?? null,
				createdAt: Date.now()
			}
		]);
		await this.alertChannelsChanged();
		return { ok: true };
	}

	async unsubscribe(endpoint: string): Promise<{ ok: true }> {
		this.store.writeState(
			DEVICES_KEY,
			this.devices().filter((device) => device.endpoint !== endpoint)
		);
		return { ok: true };
	}

	async testPush(): Promise<Refusal | { sent: number; statuses: number[] }> {
		if (!this.env.VAPID_PRIVATE_KEY)
			return { error: 'VAPID keys are not configured on the server.', status: 500 };
		const devices = this.devices();
		if (!devices.length) return { error: 'No devices are subscribed.', status: 400 };
		const vapid = vapidFromEnv(this.env, this.env.APP_URL);
		const statuses = await Promise.all(
			devices.map((device) =>
				sendPush(
					device,
					{
						title: 'Hush is connected',
						body: 'Push notifications work on this device.',
						url: `${this.env.APP_URL}/`,
						tag: 'test'
					},
					vapid
				).catch(() => 0)
			)
		);
		return { sent: statuses.filter((s) => s >= 200 && s < 300).length, statuses };
	}

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get('Upgrade') !== 'websocket')
			return new Response('Expected a WebSocket', { status: 426 });
		const [client, server] = Object.values(new WebSocketPair());
		this.ctx.acceptWebSocket(server);
		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(_socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
		const engine = this.open();
		if (!engine) return;
		const now = Date.now();
		if (message === APP_FOCUS_MESSAGE) engine.appFocused(now + APP_FOCUS_LASTS_MS, now);
		else if (message === APP_BLUR_MESSAGE) engine.appBlurred(now);
		await this.settle();
	}

	async webSocketClose(socket: WebSocket, code: number): Promise<void> {
		const sendable = code === 1000 || (code >= 3000 && code < 5000);
		socket.close(sendable ? code : 1000);
	}
}
