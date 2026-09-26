import { listNotifications } from './github';
import {
	MIN,
	ACTIVE_WINDOW,
	FIRST_SYNC_DAYS,
	PAUSE_AFTER_NO_PUSH,
	PAUSE_AFTER_WITH_PUSH,
	POLL_ACTIVE,
	POLL_IDLE,
	type PollStatus
} from './poller/shared';
import { PollerData } from './poller/data';

export { MUTED_BY_USER, type PollStatus } from './poller/shared';

export class Poller extends PollerData {
	private running: Promise<void> | null = null;
	/** Time of the last good poll by this instance. Covers the moment between alarms (no alarm set). */
	private lastGoodPoll = 0;

	async start(userId: number, origin: string): Promise<void> {
		// Signing in redoes the first sync (the last 14 days): a new token can see threads the old one
		// could not. Existing threads keep their triage state.
		await this.ctx.storage.delete(['initialized', 'lastModified', 'pollGap']);
		await this.ctx.storage.put({
			userId,
			origin,
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

	async setHasPush(hasPush: boolean): Promise<void> {
		await this.ctx.storage.put('hasPush', hasPush);
	}

	/** The UI calls this when it is open. An idle account (15-minute polls) polls again within 5. */
	async touch(origin?: string): Promise<void> {
		const now = Date.now();
		await this.ctx.storage.put('lastActive', now);
		// Push links open the address you use now (for example after a domain move).
		if (origin) await this.putChanged({ origin });
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
		await this.runOnce();
		await this.schedule();
		await this.broadcastStatus();
		const resolved = await this.checkInbox().catch((err) => {
			console.error('inbox check failed', err);
			return [];
		});
		return { ...(await this.status()), resolved };
	}

	async status(): Promise<PollStatus> {
		const s = await this.ctx.storage.get(['lastError', 'ssoHiddenOrgs']);
		return {
			lastPollAt: await this.lastPollAt(),
			lastError: (s.get('lastError') as string) ?? null,
			ssoHiddenOrgs: ((s.get('ssoHiddenOrgs') as string[] | undefined) ?? []).length,
			nextPollAt: await this.ctx.storage.getAlarm()
		};
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
		await this.runOnce();
		await this.schedule();
		await this.broadcastStatus();
	}

	/** The poll times and error for open tabs ("Synced 2m ago"), with no request from them. */
	private async broadcastStatus(): Promise<void> {
		if (!this.ctx.getWebSockets().length) return;
		const s = await this.status();
		this.broadcast({
			type: 'status',
			lastPollAt: s.lastPollAt,
			nextPollAt: s.nextPollAt,
			lastPollError: s.lastError,
			ssoHiddenOrgs: s.ssoHiddenOrgs
		});
	}

	private runOnce(): Promise<void> {
		// Alarms and manual syncs can overlap while we wait on fetch(); run one poll at a time.
		// A failed poll must not throw: an alarm that keeps throwing is dropped after its retries,
		// and polling would stop for this user with no visible error.
		this.running ??= this.poll()
			.catch((err) => {
				console.error('poll failed', err);
				return this.fail(`Sync failed: ${(err as Error).message}`);
			})
			.finally(() => (this.running = null));
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
		if (errors > 0) delay = Math.min(base * 2 ** (errors - 1), 30 * MIN);
		else if (s.get('hasPush') || idleFor < ACTIVE_WINDOW) delay = base;
		else delay = Math.max(base, POLL_IDLE);
		const retryAt = Number(s.get('retryAt') ?? 0);
		const at = Math.max(now + delay, retryAt);
		await this.ctx.storage.setAlarm(at);
		await this.putChanged({ pollGap: at - now });
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
			return this.fail('Could not decrypt the stored token. Sign in again.', { stop: true });
		}
		if (!who || !(await this.recheckAccess(user, who.token))) return;
		const initialized = (await this.ctx.storage.get<boolean>('initialized')) ?? false;
		const lastModified = await this.ctx.storage.get<string>('lastModified');

		let page;
		try {
			page = await listNotifications(
				who.token,
				initialized
					? { ifModifiedSince: lastModified }
					: {
							all: true,
							since: new Date(Date.now() - FIRST_SYNC_DAYS * 24 * 60 * MIN).toISOString(),
							maxPages: 3
						}
			);
		} catch (err) {
			return this.fail(`Network error: ${(err as Error).message}`);
		}

		if (page.status === 401)
			return this.fail('GitHub rejected the token. Sign in again with a new token.', {
				stop: true
			});
		if (page.status === 403 || page.status === 429)
			return this.fail('GitHub rate limit or permission error. Hush will retry later.', {
				retryAt: page.resetAt
			});
		if (page.status !== 200 && page.status !== 304)
			return this.fail(`GitHub returned ${page.status}.`);

		this.lastGoodPoll = Date.now();
		await this.putChanged({
			pollInterval: page.pollInterval,
			lastError: null,
			errorCount: 0,
			retryAt: 0
		});
		if (page.status === 304) {
			await this.wakeSnoozed();
			return this.watch(who);
		}
		await this.putChanged({ ssoHiddenOrgs: page.ssoHiddenOrgs });
		const ingested = await this.ingest(who, page.items, initialized);
		// Save Last-Modified only after the threads are stored. If ingest fails, the next poll
		// asks GitHub again instead of getting a 304 and losing those notifications.
		await this.ctx.storage.put({
			initialized: true,
			...(page.lastModified ? { lastModified: page.lastModified } : {})
		});
		await this.wakeSnoozed();
		await this.watch(who, ingested);
		await this.cleanup();
	}
}
