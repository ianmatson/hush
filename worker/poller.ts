import { DurableObject } from 'cloudflare:workers';
import { MINUTE_MS } from '../src/lib/shared/durations';
import type { Env } from './db';
import { createSnapshotReader, type SnapshotPrincipal } from './assistant/snapshot';
import { githubStatusMessage, listNotifications } from './github';
import {
	ACTIVE_WINDOW,
	PAUSE_AFTER_NO_PUSH,
	PAUSE_AFTER_WITH_PUSH,
	POLL_ACTIVE,
	POLL_IDLE,
	type PollStatus
} from './poller/shared';
import { PollerData } from './poller/data';

export type { PollStatus } from './poller/shared';

const NOTIFICATION_BASELINE_KEYS = ['initialized', 'lastModified'];
const REBUILT_AT_SIGN_IN_KEYS = ['pollGap', 'dash:pr', 'dash:issue', 'teams'];

const logFailure = (step: string) => (err: unknown) =>
	console.error(`${step} failed`, (err as Error).message);
export class Poller extends DurableObject<Env> {
	#engine: ActivePoller | null = null;

	async #active(): Promise<ActivePoller> {
		this.#engine ??= new ActivePoller(this.ctx, this.env);
		await this.#engine.activate();
		return this.#engine;
	}

	savedViewsSnapshot(principal: SnapshotPrincipal) {
		return createSnapshotReader(this.ctx.storage, principal)();
	}

	async start(
		...args: Parameters<ActivePoller['start']>
	): Promise<Awaited<ReturnType<ActivePoller['start']>>> {
		const active = await this.#active();
		return active.start(...args);
	}

	async touch(
		...args: Parameters<ActivePoller['touch']>
	): Promise<Awaited<ReturnType<ActivePoller['touch']>>> {
		const active = await this.#active();
		return active.touch(...args);
	}

	async pollNow(
		...args: Parameters<ActivePoller['pollNow']>
	): Promise<Awaited<ReturnType<ActivePoller['pollNow']>>> {
		const active = await this.#active();
		return active.pollNow(...args);
	}

	async status(
		...args: Parameters<ActivePoller['status']>
	): Promise<Awaited<ReturnType<ActivePoller['status']>>> {
		const active = await this.#active();
		return active.status(...args);
	}

	async alarm(
		...args: Parameters<ActivePoller['alarm']>
	): Promise<Awaited<ReturnType<ActivePoller['alarm']>>> {
		const active = await this.#active();
		return active.alarm(...args);
	}

	async fetch(
		...args: Parameters<ActivePoller['fetch']>
	): Promise<Awaited<ReturnType<ActivePoller['fetch']>>> {
		const active = await this.#active();
		return active.fetch(...args);
	}

	async webSocketMessage(
		...args: Parameters<ActivePoller['webSocketMessage']>
	): Promise<Awaited<ReturnType<ActivePoller['webSocketMessage']>>> {
		const active = await this.#active();
		return active.webSocketMessage(...args);
	}

	async webSocketError(
		...args: Parameters<ActivePoller['webSocketError']>
	): Promise<Awaited<ReturnType<ActivePoller['webSocketError']>>> {
		const active = await this.#active();
		return active.webSocketError(...args);
	}

	async webSocketClose(
		...args: Parameters<ActivePoller['webSocketClose']>
	): Promise<Awaited<ReturnType<ActivePoller['webSocketClose']>>> {
		const active = await this.#active();
		return active.webSocketClose(...args);
	}

	async teams(
		...args: Parameters<ActivePoller['teams']>
	): Promise<Awaited<ReturnType<ActivePoller['teams']>>> {
		const active = await this.#active();
		return active.teams(...args);
	}

	async stop(
		...args: Parameters<ActivePoller['stop']>
	): Promise<Awaited<ReturnType<ActivePoller['stop']>>> {
		const active = await this.#active();
		return active.stop(...args);
	}

	async alertChannelsChanged(
		...args: Parameters<ActivePoller['alertChannelsChanged']>
	): Promise<Awaited<ReturnType<ActivePoller['alertChannelsChanged']>>> {
		const active = await this.#active();
		return active.alertChannelsChanged(...args);
	}

	async me(
		...args: Parameters<ActivePoller['me']>
	): Promise<Awaited<ReturnType<ActivePoller['me']>>> {
		const active = await this.#active();
		return active.me(...args);
	}

	async markUnseen(
		...args: Parameters<ActivePoller['markUnseen']>
	): Promise<Awaited<ReturnType<ActivePoller['markUnseen']>>> {
		const active = await this.#active();
		return active.markUnseen(...args);
	}

	async markSeen(
		...args: Parameters<ActivePoller['markSeen']>
	): Promise<Awaited<ReturnType<ActivePoller['markSeen']>>> {
		const active = await this.#active();
		return active.markSeen(...args);
	}

	async feedEntries(
		...args: Parameters<ActivePoller['feedEntries']>
	): Promise<Awaited<ReturnType<ActivePoller['feedEntries']>>> {
		const active = await this.#active();
		return active.feedEntries(...args);
	}

	async updateSettings(
		...args: Parameters<ActivePoller['updateSettings']>
	): Promise<Awaited<ReturnType<ActivePoller['updateSettings']>>> {
		const active = await this.#active();
		return active.updateSettings(...args);
	}

	async pinItems(
		...args: Parameters<ActivePoller['pinItems']>
	): Promise<Awaited<ReturnType<ActivePoller['pinItems']>>> {
		const active = await this.#active();
		return active.pinItems(...args);
	}

	async reevaluateItems(
		...args: Parameters<ActivePoller['reevaluateItems']>
	): Promise<Awaited<ReturnType<ActivePoller['reevaluateItems']>>> {
		const active = await this.#active();
		return active.reevaluateItems(...args);
	}

	async pushDevices(
		...args: Parameters<ActivePoller['pushDevices']>
	): Promise<Awaited<ReturnType<ActivePoller['pushDevices']>>> {
		const active = await this.#active();
		return active.pushDevices(...args);
	}

	async subscribe(
		...args: Parameters<ActivePoller['subscribe']>
	): Promise<Awaited<ReturnType<ActivePoller['subscribe']>>> {
		const active = await this.#active();
		return active.subscribe(...args);
	}

	async unsubscribe(
		...args: Parameters<ActivePoller['unsubscribe']>
	): Promise<Awaited<ReturnType<ActivePoller['unsubscribe']>>> {
		const active = await this.#active();
		return active.unsubscribe(...args);
	}

	async testPush(
		...args: Parameters<ActivePoller['testPush']>
	): Promise<Awaited<ReturnType<ActivePoller['testPush']>>> {
		const active = await this.#active();
		return active.testPush(...args);
	}

	async alerts(
		...args: Parameters<ActivePoller['alerts']>
	): Promise<Awaited<ReturnType<ActivePoller['alerts']>>> {
		const active = await this.#active();
		return active.alerts(...args);
	}

	async dashboardView(
		...args: Parameters<ActivePoller['dashboardView']>
	): Promise<Awaited<ReturnType<ActivePoller['dashboardView']>>> {
		const active = await this.#active();
		return active.dashboardView(...args);
	}

	async snoozeItems(
		...args: Parameters<ActivePoller['snoozeItems']>
	): Promise<Awaited<ReturnType<ActivePoller['snoozeItems']>>> {
		const active = await this.#active();
		return active.snoozeItems(...args);
	}

	async unsnoozeItems(
		...args: Parameters<ActivePoller['unsnoozeItems']>
	): Promise<Awaited<ReturnType<ActivePoller['unsnoozeItems']>>> {
		const active = await this.#active();
		return active.unsnoozeItems(...args);
	}

	async muteItems(
		...args: Parameters<ActivePoller['muteItems']>
	): Promise<Awaited<ReturnType<ActivePoller['muteItems']>>> {
		const active = await this.#active();
		return active.muteItems(...args);
	}

	async dashboard(
		...args: Parameters<ActivePoller['dashboard']>
	): Promise<Awaited<ReturnType<ActivePoller['dashboard']>>> {
		const active = await this.#active();
		return active.dashboard(...args);
	}

	async countSource(
		...args: Parameters<ActivePoller['countSource']>
	): Promise<Awaited<ReturnType<ActivePoller['countSource']>>> {
		const active = await this.#active();
		return active.countSource(...args);
	}

	async rebuildBoards(
		...args: Parameters<ActivePoller['rebuildBoards']>
	): Promise<Awaited<ReturnType<ActivePoller['rebuildBoards']>>> {
		const active = await this.#active();
		return active.rebuildBoards(...args);
	}

	async recheck(
		...args: Parameters<ActivePoller['recheck']>
	): Promise<Awaited<ReturnType<ActivePoller['recheck']>>> {
		const active = await this.#active();
		return active.recheck(...args);
	}

	async recordFetched(
		...args: Parameters<ActivePoller['recordFetched']>
	): Promise<Awaited<ReturnType<ActivePoller['recordFetched']>>> {
		const active = await this.#active();
		return active.recordFetched(...args);
	}
}

export class ActivePoller extends PollerData {
	private running: Promise<void> | null = null;
	private cycling: Promise<void> | null = null;
	/** Time of the last good poll by this instance. Covers the moment between alarms (no alarm set). */
	private lastGoodPoll = 0;

	activate(): Promise<void> {
		return this.initializeActive();
	}

	async start(userId: number, tokenUnchanged = false): Promise<void> {
		const state = await this.ctx.storage.get(['userId', 'stopped', 'paused']);
		const pollingHadNoGap =
			tokenUnchanged &&
			state.get('userId') === userId &&
			!state.get('stopped') &&
			!state.get('paused');
		await this.ctx.storage.delete(
			pollingHadNoGap
				? REBUILT_AT_SIGN_IN_KEYS
				: [...NOTIFICATION_BASELINE_KEYS, ...REBUILT_AT_SIGN_IN_KEYS]
		);
		this.broadcast({ type: 'dash', kind: 'pr' });
		this.broadcast({ type: 'dash', kind: 'issue' });
		await this.ctx.storage.put({
			userId,
			mcpAccessVersion:
				(await this.ctx.storage.get<string>('mcpAccessVersion')) ?? crypto.randomUUID(),
			lastActive: Date.now(),
			errorCount: 0,
			lastError: null,
			stopped: false,
			retryAt: 0
		});
		// After stop() (account deleted, then signed in again), the tables are gone.
		await this.migrate();
		await this.ctx.storage.setAlarm(Date.now() + 500);
	}

	/** The UI calls this when it is open. An idle account (15-minute polls) polls again within 5. */
	async touch(): Promise<void> {
		const now = Date.now();
		await this.ctx.storage.put('lastActive', now);
		const [alarm, lastPollAt, stopped] = await Promise.all([
			this.ctx.storage.getAlarm(),
			this.lastPollAt(),
			this.ctx.storage.get<boolean>('stopped')
		]);
		if (stopped) return;
		await this.ctx.storage.delete('paused');
		const due = (lastPollAt ?? 0) + POLL_ACTIVE;
		if (alarm === null || alarm > due) {
			const at = Math.max(due, now + 500);
			await this.ctx.storage.setAlarm(at);
			// Keep "alarm minus gap" equal to the time of the last poll.
			if (lastPollAt) await this.putChanged({ pollGap: at - lastPollAt });
		}
	}

	async pollNow(): Promise<PollStatus> {
		await this.ctx.storage.put('lastActive', Date.now());
		await this.cycle();
		return this.status();
	}

	async status(): Promise<PollStatus> {
		return {
			lastPollAt: await this.lastPollAt(),
			lastError: (await this.ctx.storage.get<string>('lastError')) ?? null,
			nextPollAt: await this.ctx.storage.getAlarm(),
			smartDecisionsPaused: await this.decisionsPaused(),
			smartDecisionsChecking: await this.decisionFillPending()
		};
	}

	private async runDecisionFill(): Promise<void> {
		await this.fillDecisions().catch(logFailure('decision fill'));
	}

	/**
	 * A good poll does not store its time: that would be a storage write every few minutes for each
	 * user, and writes are the first free-plan limit we hit. schedule() stores the gap to the next
	 * alarm (it seldom changes), so the time is the alarm minus that gap. Failed polls and pauses
	 * store `lastPollAt` directly.
	 */
	private async lastPollAt(): Promise<number | null> {
		const [alarm, s] = await Promise.all([
			this.ctx.storage.getAlarm(),
			this.ctx.storage.get(['lastPollAt', 'pollGap'])
		]);
		const stored = (s.get('lastPollAt') as number | undefined) ?? 0;
		const gap = s.get('pollGap') as number | undefined;
		const fromAlarm = alarm !== null && gap !== undefined ? alarm - gap : 0;
		return Math.max(stored, fromAlarm, this.lastGoodPoll) || null;
	}

	async alarm(): Promise<void> {
		await this.cycle();
	}

	private cycle(): Promise<void> {
		this.cycling ??= this.exclusive(() => this.runCycle()).finally(() => {
			this.cycling = null;
		});
		return this.cycling;
	}

	private async runCycle(): Promise<void> {
		try {
			await this.flushHeld().catch(logFailure('held alerts'));
			await this.runOnce();
			await this.runDecisionFill();
		} finally {
			await this.schedule();
		}
		await this.broadcastStatus().catch(logFailure('status broadcast'));
	}

	/** The poll times and error for open tabs ("Synced 2m ago"), with no request from them. */
	private async broadcastStatus(): Promise<void> {
		if (!this.ctx.getWebSockets().length) return;
		const s = await this.status();
		this.broadcast({
			type: 'status',
			lastPollAt: s.lastPollAt,
			nextPollAt: s.nextPollAt,
			lastPollError: s.lastError
		});
	}

	private runOnce(): Promise<void> {
		// Alarms and manual syncs can overlap while we wait on fetch(); run one poll at a time.
		// A failed poll must not throw: an alarm that keeps throwing is dropped after its retries,
		// and polling would stop for this user with no visible error.
		if (!this.running) this.broadcast({ type: 'syncing', on: true });
		this.running ??= this.poll()
			.catch((err) => {
				console.error('poll failed', err);
				return this.fail(`Sync failed: ${(err as Error).message}`);
			})
			.finally(() => {
				this.running = null;
				this.broadcast({ type: 'syncing', on: false });
			});
		return this.running;
	}

	private async schedule(): Promise<void> {
		const s = await this.ctx.storage.get([
			'userId',
			'stopped',
			'pollInterval',
			'lastActive',
			'errorCount',
			'hasPush',
			'retryAt'
		]);
		if (!s.get('userId') || s.get('stopped')) return;
		const now = Date.now();
		const base = Math.max(Number(s.get('pollInterval') ?? 60) * 1000, POLL_ACTIVE);
		const errors = Number(s.get('errorCount') ?? 0);
		const idleFor = now - Number(s.get('lastActive') ?? 0);
		if (idleFor > (s.get('hasPush') ? PAUSE_AFTER_WITH_PUSH : PAUSE_AFTER_NO_PUSH)) {
			// No alarm from now on, so store the poll time itself.
			await this.ctx.storage.put({ paused: true, lastPollAt: now });
			return;
		}
		let delay: number;
		if (errors > 0) delay = Math.min(base * 2 ** (errors - 1), 30 * MINUTE_MS);
		else if (s.get('hasPush') || idleFor < ACTIVE_WINDOW) delay = base;
		else delay = Math.max(base, POLL_IDLE);
		const retryAt = Number(s.get('retryAt') ?? 0);
		const at = Math.max(now + delay, retryAt);
		await this.ctx.storage.setAlarm(at);
		await this.putChanged({ pollGap: at - now });
	}

	/** Sign the user out everywhere: Hush cannot use their token any more. */
	private async endSessions(userId: number) {
		await this.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
	}

	private async fail(message: string, opts: { stop?: boolean; retryAt?: number } = {}) {
		const errorCount = ((await this.ctx.storage.get<number>('errorCount')) ?? 0) + 1;
		await this.ctx.storage.put({
			lastError: message,
			errorCount,
			stopped: !!opts.stop,
			retryAt: opts.retryAt ?? 0,
			lastPollAt: Date.now()
		});
	}

	private async poll(): Promise<void> {
		const user = await this.account();
		if (!user) return (await this.ctx.storage.get<number>('userId')) ? this.stop() : undefined;
		let who;
		try {
			who = await this.who();
		} catch {
			await this.endSessions(user.id);
			return this.fail('Could not decrypt the stored token. Sign in again.', { stop: true });
		}
		if (!who) return;
		const initialized = (await this.ctx.storage.get<boolean>('initialized')) ?? false;
		const lastModified = await this.ctx.storage.get<string>('lastModified');

		let page;
		try {
			page = await listNotifications(
				who.token,
				initialized ? { ifModifiedSince: lastModified } : {}
			);
		} catch (err) {
			return this.fail(`Network error: ${(err as Error).message}`);
		}

		if (page.status === 401) {
			// The token was revoked or expired: no browser should stay signed in with it.
			await this.endSessions(user.id);
			return this.fail('GitHub rejected the token. Sign in again with a new token.', {
				stop: true
			});
		}
		const rateLimited = (page.status === 403 || page.status === 429) && page.retryAt !== undefined;
		if (rateLimited)
			return this.fail('GitHub rate limit. Hush will retry later.', { retryAt: page.retryAt });
		if (page.status !== 200 && page.status !== 304)
			return this.fail(githubStatusMessage(page.status));

		this.lastGoodPoll = Date.now();
		await this.putChanged({
			pollInterval: page.pollInterval,
			lastError: null,
			errorCount: 0,
			retryAt: 0
		});
		if (page.status === 304) {
			await this.ingest(who, [], initialized);
			await this.keepTrackedFresh();
			return this.cleanup();
		}
		await this.ingest(who, page.items, initialized);
		await this.ctx.storage.put({
			initialized: true,
			...(page.lastModified ? { lastModified: page.lastModified } : {})
		});
		await this.keepTrackedFresh();
		await this.cleanup();
	}
}
