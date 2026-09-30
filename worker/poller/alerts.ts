import { inQuietHours } from '../../src/lib/shared/quiet';
import type { Classification } from '../../src/lib/shared/types';
import type { GhNotification } from '../github';
import { sendPush, vapidFromEnv, type PushMessage } from '../webpush';
import { PollerBase } from './base';
import { MAX_INDIVIDUAL_PUSHES, ALERT_LOG_KEEP, NON_THREAD_TAGS } from './shared';
import type { ThreadRow } from './schema';

const marks = (n: number) => Array(n).fill('?').join(',');

/** Alerts that waited for the end of quiet hours: how many, and the first titles. */
type Held = { count: number; lines: string[] };

/** Push alerts: send them, record them in the alert history, and update them when resolved. */
export abstract class PollerAlerts extends PollerBase {
	protected async push(items: { n: GhNotification; c: Classification }[]) {
		const origin = (await this.ctx.storage.get<string>('origin')) ?? '';
		const one = ({ n, c }: (typeof items)[number]): PushMessage => ({
			title: c.summary,
			body: `${n.subject.title}\n${n.repository.full_name}`,
			url: c.actionUrl,
			tag: n.id
		});
		const messages: PushMessage[] =
			items.length <= MAX_INDIVIDUAL_PUSHES
				? items.map(one)
				: [
						{
							title: `${items.length} things need you`,
							body: items
								.slice(0, 4)
								.map(({ c }) => c.summary)
								.join('\n'),
							url: `${origin}/inbox`,
							tag: 'digest'
						}
					];
		// The history lists each alert, also the ones this push put together in one.
		await this.send(messages, items.map(one));
	}

	/**
	 * Send push messages to every device; forget devices the push service dropped. `log` is what
	 * the alert history records (default: the messages; never resolve updates). In quiet hours
	 * nothing is sent: the history records the alerts, and they go out as one push when quiet
	 * hours end (see flushQuiet). Returns whether it sent.
	 */
	protected async send(messages: PushMessage[], log = messages): Promise<boolean> {
		const devices = this.all<{ endpoint: string; p256dh: string; auth: string }>(
			'SELECT endpoint, p256dh, auth FROM push_devices'
		);
		await this.putChanged({ hasPush: devices.length > 0 });
		if (!devices.length || !this.env.VAPID_PRIVATE_KEY) return false;
		if (inQuietHours((await this.settings()).quietHours)) {
			const held = log.filter((m) => m.tag !== 'test');
			this.logAlerts(held);
			if (held.length) {
				const q = (await this.ctx.storage.get<Held>('quietHeld')) ?? { count: 0, lines: [] };
				await this.ctx.storage.put('quietHeld', {
					count: q.count + held.length,
					lines: [...q.lines, ...held.map((m) => m.title)].slice(0, 4)
				});
			}
			return false;
		}
		const origin = (await this.ctx.storage.get<string>('origin')) ?? '';
		const vapid = vapidFromEnv(this.env, origin);
		const gone: string[] = [];
		for (const d of devices) {
			for (const msg of messages) {
				try {
					const status = await sendPush(d, msg, vapid, 'high');
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
		this.logAlerts(log);
		return true;
	}

	/** After quiet hours: one push for the alerts that waited (called after each poll). */
	protected async flushQuiet(): Promise<void> {
		const held = await this.ctx.storage.get<Held>('quietHeld');
		if (!held || inQuietHours((await this.settings()).quietHours)) return;
		await this.ctx.storage.delete('quietHeld');
		const origin = (await this.ctx.storage.get<string>('origin')) ?? '';
		const summary: PushMessage = {
			title: held.count === 1 ? '1 alert while quiet' : `${held.count} alerts while quiet`,
			body: held.lines.join('\n'),
			url: `${origin}/inbox`,
			tag: 'digest'
		};
		// Already in the history, one by one.
		await this.send([summary], []);
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
					m.tag && !NON_THREAD_TAGS.has(m.tag) ? m.tag : null
				);
			this.run('DELETE FROM alerts WHERE sent_at < ?', now - ALERT_LOG_KEEP);
		});
		this.broadcast({ type: 'alerts' });
	}
}
