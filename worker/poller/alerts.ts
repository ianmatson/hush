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
import { deliveredByAnyChannel, type ChannelSend } from '../alert-channels';
import { slackIsConfigured } from '../slack';
import { sendSlackAlerts } from '../slack-alerts';
import { slackConnection } from '../slack-store';
import { sendPush, vapidFromEnv, type PushMessage } from '../webpush';
import { PollerBase } from './base';
import { IN_KEYS, MAX_INDIVIDUAL_PUSHES, ALERT_LOG_KEEP, PUSH_MARK_KEEP } from './shared';

const MAX_HELD_MESSAGES = 10;
const DIGEST_LINES = 4;
const isItemKey = (tag: string | undefined): tag is string => !!tag?.includes('#');

export interface PushCandidate {
	itemKey: string;
	reason: string;
	message: PushMessage;
	ignoresRepeatSetting?: boolean;
	urgent?: boolean;
}

type OpenChannels = { push: boolean; slack: boolean };

type Held = { count: number; messages: PushMessage[]; duringQuiet: boolean };

/** Push alerts: send them, record them in the alert history, and update them when resolved. */
export abstract class PollerAlerts extends PollerBase {
	protected async deliver(candidates: PushCandidate[]): Promise<void> {
		if (!candidates.length || !(await this.updateHasAlertChannel())) return;
		const settings = await this.settings();
		const pushUrgentNow = settings.smartDecisions && settings.pushUrgentNow;
		const urgent = pushUrgentNow ? candidates.filter((c) => c.urgent) : [];
		const rest = candidates.filter((c) => !urgent.includes(c));
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
		const messages = due.map((c): PushMessage => ({ ...c.message, tag: c.itemKey }));
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
				: [digestOf(messages, messages.length, false, this.origin())];
		const room = urgent ? outgoing.length : limitRoom(settings, now, state);
		const sendable = outgoing.slice(0, room);
		const overLimit = outgoing.slice(room);
		const delivered = await this.sendNow(sendable);
		if (delivered) await this.recordSend(settings, now, state, sendable.length, false);
		const retry = delivered ? overLimit : outgoing;
		if (retry.length)
			await this.hold(
				{ count: retry.length, messages: retry, duringQuiet: false },
				{ startsDigestWindow: false }
			);
		this.savePushMarks(due, now);
	}

	private queue: Promise<unknown> | undefined;

	protected exclusive<T>(work: () => Promise<T>): Promise<T> {
		const run = Promise.resolve(this.queue).then(work, work);
		this.queue = run.catch(() => {});
		return run;
	}

	protected async flushHeld(): Promise<void> {
		const held = await this.held();
		if (!held.count) return;
		const settings = await this.settings();
		const now = Date.now();
		if (!settings.pushWhileOpen && this.appInFocus(now))
			return void (await this.ctx.storage.delete('held'));
		const state = await this.deliveryState();
		if (!heldAreDue(settings, now, state)) return;
		await this.ctx.storage.delete('held');
		let delivered = false;
		try {
			const onlyOne = held.count === 1 && held.messages.length === 1;
			const message = onlyOne
				? held.messages[0]
				: digestOf(held.messages, held.count, held.duringQuiet, this.origin());
			delivered = await this.sendNow([message]);
			if (delivered) await this.recordSend(settings, now, state, 1, true);
		} finally {
			if (!delivered) await this.hold(held, { startsDigestWindow: false });
		}
	}

	protected clearPushMarks(itemKeys: string[]) {
		this.runIn(`DELETE FROM push_marks WHERE key ${IN_KEYS}`, itemKeys);
	}

	protected forgetOldPushMarks(now: number) {
		this.run('DELETE FROM push_marks WHERE pushed_at < ?', now - PUSH_MARK_KEEP);
	}

	protected async updateHasAlertChannel(): Promise<boolean> {
		const open = await this.openChannels(await this.settings());
		const hasChannel = open.push || open.slack;
		await this.putChanged({ hasPush: hasChannel });
		return hasChannel;
	}

	private async openChannels(settings: Settings): Promise<OpenChannels> {
		const devices = this.one<{ n: number }>('SELECT COUNT(*) AS n FROM push_devices')?.n ?? 0;
		return {
			push: settings.alertChannels.push && devices > 0 && !!this.env.VAPID_PRIVATE_KEY,
			slack: settings.alertChannels.slack && (await this.slackIsConnected())
		};
	}

	private async slackIsConnected(): Promise<boolean> {
		const userId = await this.ctx.storage.get<number>('userId');
		if (!userId || !slackIsConfigured(this.env)) return false;
		return !!(await slackConnection(this.env, userId));
	}

	private origin(): string {
		return this.env.APP_URL;
	}

	private pushMarks(itemKeys: string[]): Map<string, PushMark> {
		const found = new Map<string, PushMark>();
		for (const r of this.allIn<{ key: string; pushed_at: number; reason: string }>(
			`SELECT key, pushed_at, reason FROM push_marks WHERE key ${IN_KEYS}`,
			itemKeys
		))
			found.set(r.key, { pushedAt: r.pushed_at, reason: r.reason });
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
		return (
			(await this.ctx.storage.get<Held>('held')) ?? { count: 0, messages: [], duringQuiet: false }
		);
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
		if (!messages.length) return false;
		const open = await this.openChannels(await this.settings());
		const sends: ChannelSend[] = [];
		if (open.push) sends.push(() => this.sendPushNow(messages));
		if (open.slack) sends.push(() => this.sendSlackNow(messages));
		return deliveredByAnyChannel(sends);
	}

	private async sendSlackNow(messages: PushMessage[]): Promise<boolean> {
		const userId = await this.ctx.storage.get<number>('userId');
		return userId ? sendSlackAlerts(this.env, userId, messages, this.origin()) : false;
	}

	private async sendPushNow(messages: PushMessage[]): Promise<boolean> {
		const devices = this.all<{ endpoint: string; p256dh: string; auth: string }>(
			'SELECT endpoint, p256dh, auth FROM push_devices'
		);
		if (!messages.length || !devices.length || !this.env.VAPID_PRIVATE_KEY) return false;
		const vapid = vapidFromEnv(this.env, this.origin());
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
		this.runIn(`DELETE FROM push_devices WHERE endpoint ${IN_KEYS}`, gone);
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
					'INSERT INTO alerts (sent_at, title, body, url, item_key) VALUES (?, ?, ?, ?, ?)',
					now,
					m.title,
					m.body,
					m.url,
					isItemKey(m.tag) ? m.tag : null
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
		title: duringQuiet ? `${count} ${noun} while quiet` : `${count} ${noun}`,
		body: messages
			.slice(-DIGEST_LINES)
			.map((m) => m.title)
			.join('\n'),
		url: `${origin}/`,
		tag: 'digest'
	};
}
