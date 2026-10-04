import {
	digestWindowIsOver,
	heldAreDue,
	holdReason,
	keptSends,
	limitRoom,
	mayBuzzAgain,
	type DeliveryState,
	type PushMark
} from '../../src/lib/shared/push-policy';
import type { Settings } from '../../src/lib/shared/types';
import { sendPush, vapidFromEnv, type PushMessage } from '../webpush';
import { PollerBase } from './base';
import { MAX_INDIVIDUAL_PUSHES, ALERT_LOG_KEEP, NON_THREAD_TAGS, PUSH_MARK_KEEP } from './shared';

const marks = (n: number) => Array(n).fill('?').join(',');
const SQL_BATCH = 90;
const MAX_HELD_MESSAGES = 10;
const DIGEST_LINES = 4;
const MAX_ACTION_THREADS = 20;

export const SNOOZE_OVER_REASON = 'snooze-over';

export interface PushCandidate {
	itemKey: string;
	reason: string;
	message: PushMessage;
	ignoresRepeatSetting?: boolean;
	urgent?: boolean;
	pushes: boolean;
}

type Held = { count: number; messages: PushMessage[]; duringQuiet: boolean };
type LegacyQuietHeld = { count: number; lines: string[] };

/** Push alerts: send them, record them in the alert history, and update them when resolved. */
export abstract class PollerAlerts extends PollerBase {
	protected async deliver(candidates: PushCandidate[]): Promise<void> {
		if (!candidates.length) return;
		const latestPerItem = [...new Map(candidates.map((c) => [c.itemKey, c])).values()];
		const canPush = await this.updateHasPush();
		const pushing = canPush ? latestPerItem.filter((c) => c.pushes) : [];
		const historyOnly = latestPerItem.filter((c) => !pushing.includes(c));
		if (historyOnly.length)
			this.logAlerts(historyOnly.map((c) => ({ ...c.message, tag: c.itemKey })));
		if (!pushing.length) return;
		const settings = await this.settings();
		const pushUrgentNow = settings.smartDecisions && settings.pushUrgentNow;
		const urgent = pushUrgentNow ? pushing.filter((c) => c.urgent) : [];
		const rest = pushing.filter((c) => !urgent.includes(c));
		if (urgent.length) await this.deliverBatch(settings, urgent, true);
		if (rest.length) await this.deliverBatch(settings, rest, false);
	}

	private async deliverBatch(
		settings: Settings,
		candidates: PushCandidate[],
		urgent: boolean
	): Promise<void> {
		const now = Date.now();
		const latestPerItem = new Map(candidates.map((c) => [c.itemKey, c]));
		const appSeenAt = await this.appSeenAt();
		const previous = this.pushMarks([...latestPerItem.keys()]);
		const due = [...latestPerItem.values()].filter(
			(c) =>
				c.ignoresRepeatSetting ||
				mayBuzzAgain(settings.pushRepeat, previous.get(c.itemKey) ?? null, c.reason, appSeenAt)
		);
		if (!due.length) return;
		const messages = due.map((c): PushMessage => ({
			...c.message,
			tag: c.itemKey,
			threadIds: this.openThreadIds(c.itemKey)
		}));
		if (!settings.pushWhileOpen && this.appInFocus(now)) return this.logAlerts(messages);
		this.logAlerts(messages);
		const state = await this.deliveryState();
		const hold = holdReason(settings, now, state, urgent);
		if (hold) {
			this.savePushMarks(due, now);
			return this.hold(
				{ count: messages.length, messages, duringQuiet: hold === 'quiet' },
				{
					startsDigestWindow: hold === 'digest' && digestWindowIsOver(settings, now, state)
				}
			);
		}
		const outgoing =
			messages.length <= MAX_INDIVIDUAL_PUSHES
				? messages
				: [digestOf(messages, messages.length, false, await this.origin())];
		const room = urgent ? outgoing.length : limitRoom(settings, now, state);
		const sendable = outgoing.slice(0, room);
		const overLimit = outgoing.slice(room);
		await this.recordSend(settings, now, state, sendable.length, false);
		const delivered = await this.sendNow(sendable);
		if (overLimit.length)
			await this.hold(
				{ count: overLimit.length, messages: overLimit, duringQuiet: false },
				{ startsDigestWindow: false }
			);
		if (delivered || overLimit.length) this.savePushMarks(due, now);
	}

	protected async flushHeld(): Promise<void> {
		const held = await this.held();
		if (!held.count) return;
		const settings = await this.settings();
		const now = Date.now();
		if (!settings.pushWhileOpen && this.appInFocus(now))
			return void (await this.ctx.storage.delete(['held', 'quietHeld']));
		const state = await this.deliveryState();
		if (!heldAreDue(settings, now, state)) return;
		await this.ctx.storage.delete(['held', 'quietHeld']);
		const onlyOne = held.count === 1 && held.messages.length === 1;
		const message = onlyOne
			? held.messages[0]
			: digestOf(held.messages, held.count, held.duringQuiet, await this.origin());
		await this.recordSend(settings, now, state, 1, true);
		if (!(await this.sendNow([message]))) await this.hold(held, { startsDigestWindow: false });
	}

	protected clearPushMarks(itemKeys: string[]) {
		for (let i = 0; i < itemKeys.length; i += SQL_BATCH) {
			const batch = itemKeys.slice(i, i + SQL_BATCH);
			this.run(`DELETE FROM push_marks WHERE key IN (${marks(batch.length)})`, ...batch);
		}
	}

	protected itemKeysOf(threadIds: string[]): string[] {
		const keys = new Set<string>();
		for (let i = 0; i < threadIds.length; i += SQL_BATCH) {
			const batch = threadIds.slice(i, i + SQL_BATCH);
			for (const r of this.all<{ item_key: string }>(
				`SELECT COALESCE(subject_key, id) AS item_key FROM threads WHERE id IN (${marks(batch.length)})`,
				...batch
			))
				keys.add(r.item_key);
		}
		return [...keys];
	}

	protected forgetOldPushMarks(now: number) {
		this.run('DELETE FROM push_marks WHERE pushed_at < ?', now - PUSH_MARK_KEEP);
	}

	private async updateHasPush(): Promise<boolean> {
		const devices = this.one<{ n: number }>('SELECT COUNT(*) AS n FROM push_devices')?.n ?? 0;
		await this.putChanged({ hasPush: devices > 0 });
		return devices > 0 && !!this.env.VAPID_PRIVATE_KEY;
	}

	private async origin(): Promise<string> {
		return (await this.ctx.storage.get<string>('origin')) ?? '';
	}

	private pushMarks(itemKeys: string[]): Map<string, PushMark> {
		const found = new Map<string, PushMark>();
		for (let i = 0; i < itemKeys.length; i += SQL_BATCH) {
			const batch = itemKeys.slice(i, i + SQL_BATCH);
			for (const r of this.all<{ key: string; pushed_at: number; reason: string }>(
				`SELECT key, pushed_at, reason FROM push_marks WHERE key IN (${marks(batch.length)})`,
				...batch
			))
				found.set(r.key, { pushedAt: r.pushed_at, reason: r.reason });
		}
		return found;
	}

	private savePushMarks(pushed: PushCandidate[], now: number) {
		this.transaction(() => {
			for (const c of pushed)
				this.run(
					`INSERT INTO push_marks (key, pushed_at, reason) VALUES (?, ?, ?)
           ON CONFLICT (key) DO UPDATE SET pushed_at = excluded.pushed_at, reason = excluded.reason`,
					c.itemKey,
					now,
					c.reason
				);
		});
	}

	private openThreadIds(itemKey: string): string[] {
		return this.all<{ id: string }>(
			`SELECT id FROM threads WHERE (subject_key = ? OR id = ?) AND triage IN ('inbox', 'snoozed')
       LIMIT ${MAX_ACTION_THREADS}`,
			itemKey,
			itemKey
		).map((r) => r.id);
	}

	private async deliveryState(): Promise<DeliveryState> {
		const s = await this.ctx.storage.get(['recentSends', 'lastDigestAt']);
		return {
			recentSends: (s.get('recentSends') as number[] | undefined) ?? [],
			lastDigestAt: (s.get('lastDigestAt') as number | undefined) ?? 0
		};
	}

	private async recordSend(
		settings: Settings,
		now: number,
		state: DeliveryState,
		pushCount: number,
		wasDigest: boolean
	) {
		const sentNow = Array<number>(pushCount).fill(now);
		await this.putChanged({
			recentSends: keptSends([...state.recentSends, ...sentNow], now, settings.pushLimit),
			...(wasDigest ? { lastDigestAt: now } : {})
		});
	}

	private async held(): Promise<Held> {
		const s = await this.ctx.storage.get(['held', 'quietHeld']);
		const held = s.get('held') as Held | undefined;
		if (held) return held;
		const legacy = s.get('quietHeld') as LegacyQuietHeld | undefined;
		if (!legacy) return { count: 0, messages: [], duringQuiet: false };
		const inbox = `${await this.origin()}/items`;
		return {
			count: legacy.count,
			messages: legacy.lines.map((title) => ({ title, body: '', url: inbox })),
			duringQuiet: true
		};
	}

	private async hold(incoming: Held, opts: { startsDigestWindow: boolean }) {
		const held = await this.held();
		const byTag = new Map(held.messages.map((m) => [m.tag ?? m.title, m]));
		const untaggedExtra = Math.max(0, incoming.count - incoming.messages.length);
		let newItems = untaggedExtra;
		for (const m of incoming.messages) {
			const tag = m.tag ?? m.title;
			if (!byTag.delete(tag)) newItems++;
			byTag.set(tag, m);
		}
		const next: Held = {
			count: held.count + newItems,
			messages: [...byTag.values()].slice(-MAX_HELD_MESSAGES),
			duringQuiet: held.duringQuiet || incoming.duringQuiet
		};
		const startsWindow = opts.startsDigestWindow && held.count === 0;
		await this.ctx.storage.put({
			held: next,
			...(startsWindow ? { lastDigestAt: Date.now() } : {})
		});
	}

	private async sendNow(messages: PushMessage[]): Promise<boolean> {
		const devices = this.all<{ endpoint: string; p256dh: string; auth: string }>(
			'SELECT endpoint, p256dh, auth FROM push_devices'
		);
		if (!messages.length || !devices.length || !this.env.VAPID_PRIVATE_KEY) return false;
		const vapid = vapidFromEnv(this.env, await this.origin());
		const gone: string[] = [];
		let accepted = 0;
		for (const d of devices) {
			for (const msg of messages) {
				try {
					const status = await sendPush(d, msg, vapid, 'high');
					if (status >= 200 && status < 300) accepted++;
					if (status === 404 || status === 410) {
						gone.push(d.endpoint);
						break;
					}
				} catch (err) {
					console.error('push failed', (err as Error).message);
				}
			}
		}
		if (gone.length)
			this.run(`DELETE FROM push_devices WHERE endpoint IN (${marks(gone.length)})`, ...gone);
		return accepted > 0;
	}

	/** Record alerts in the history (not test pushes), and drop the old ones. */
	private logAlerts(messages: PushMessage[]) {
		const logged = messages.filter((m) => m.tag !== 'test');
		if (!logged.length) return;
		const now = Date.now();
		this.transaction(() => {
			for (const m of logged)
				this.run(
					'INSERT INTO alerts (sent_at, title, body, url, thread_id) VALUES (?, ?, ?, ?, ?)',
					now,
					m.title,
					m.body,
					m.url,
					m.tag && !NON_THREAD_TAGS.has(m.tag) ? (m.threadIds?.[0] ?? null) : null
				);
			this.run('DELETE FROM alerts WHERE sent_at < ?', now - ALERT_LOG_KEEP);
		});
		this.broadcast({ type: 'alerts' });
	}
}

function digestOf(
	messages: PushMessage[],
	count: number,
	duringQuiet: boolean,
	origin: string
): PushMessage {
	const noun = count === 1 ? 'alert' : 'alerts';
	return {
		title: duringQuiet ? `${count} ${noun} while quiet` : `${count} things need you`,
		body: messages
			.slice(-DIGEST_LINES)
			.map((m) => m.title)
			.join('\n'),
		url: `${origin}/items`,
		tag: 'digest'
	};
}
