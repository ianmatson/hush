import type { Classification } from '../../src/lib/shared/types';
import { getUser, parseSettings, type ThreadRow } from '../db';
import type { GhNotification } from '../github';
import { sendPush, vapidFromEnv, type PushMessage } from '../webpush';
import { MAX_INDIVIDUAL_PUSHES, RESOLVE_WINDOW, ALERT_LOG_KEEP, NON_THREAD_TAGS } from './shared';
import { PollerBase } from './base';

/** Push alerts: send them, record them in the alert history, and update them when resolved. */
export abstract class PollerAlerts extends PollerBase {
	protected async push(userId: number, items: { n: GhNotification; c: Classification }[]) {
		const origin = (await this.ctx.storage.get<string>('origin')) ?? '';
		const messages: PushMessage[] =
			items.length <= MAX_INDIVIDUAL_PUSHES
				? items.map(({ n, c }) => ({
						title: c.summary,
						body: `${n.subject.title}\n${n.repository.full_name}`,
						url: c.actionUrl,
						tag: n.id
					}))
				: [
						{
							title: `${items.length} things need you`,
							body: items
								.slice(0, 4)
								.map(({ c }) => c.summary)
								.join('\n'),
							url: `${origin}/`,
							tag: 'digest'
						}
					];

		// The history lists each alert, also the ones this push put together in one.
		await this.send(
			userId,
			messages,
			items.map(({ n, c }) => ({
				title: c.summary,
				body: `${n.subject.title}\n${n.repository.full_name}`,
				url: c.actionUrl,
				tag: n.id
			}))
		);
	}

	/**
	 * Update alerts that were pushed in the last day and are now resolved: each is replaced by a
	 * quiet "✓ You approved"-style alert that closes itself (see the service worker). Browsers
	 * require every push to show something, so this is never an invisible push. Also called by the
	 * API for Done, Mute, and Snooze, so the alert goes away on your other devices too.
	 */
	async notifyResolved(items: { id: string; note: string }[]): Promise<void> {
		const userId = await this.ctx.storage.get<number>('userId');
		const user = userId ? await getUser(this.env, userId) : null;
		if (!user || !items.length || !parseSettings(user.settings).pushResolved) return;
		const ids = items.map((i) => i.id);
		const { results } = await this.env.DB.prepare(
			`SELECT id, title, repo, action_url FROM threads
       WHERE user_id = ? AND pushed_at > ? AND id IN (${ids.map(() => '?').join(',')})`
		)
			.bind(user.id, Date.now() - RESOLVE_WINDOW, ...ids)
			.all<Pick<ThreadRow, 'id' | 'title' | 'repo' | 'action_url'>>();
		if (!results.length) return;
		const note = new Map(items.map((i) => [i.id, i.note]));
		await this.send(
			user.id,
			results.map((r) => ({
				title: `✓ ${note.get(r.id)}`,
				body: `${r.title}\n${r.repo}`,
				url: r.action_url,
				tag: r.id,
				resolve: true
			}))
		);
		// Once is enough: a second change to the same thread must not bring the alert back.
		await this.env.DB.prepare(
			`UPDATE threads SET pushed_at = NULL WHERE user_id = ? AND id IN (${results.map(() => '?').join(',')})`
		)
			.bind(user.id, ...results.map((r) => r.id))
			.run();
	}

	/**
	 * Send push messages to every device of the user; forget devices the push service dropped.
	 * `log` is what the alert history records (default: the messages; never resolve updates).
	 */
	protected async send(userId: number, messages: PushMessage[], log = messages) {
		const { results: subs } = await this.env.DB.prepare(
			'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?'
		)
			.bind(userId)
			.all<{ id: string; endpoint: string; p256dh: string; auth: string }>();
		await this.putChanged({ hasPush: subs.length > 0 });
		if (!subs.length || !this.env.VAPID_PRIVATE_KEY) return;
		const origin = (await this.ctx.storage.get<string>('origin')) ?? '';
		const vapid = vapidFromEnv(this.env, origin);
		const gone: string[] = [];
		for (const sub of subs) {
			for (const msg of messages) {
				try {
					const status = await sendPush(sub, msg, vapid, 'high');
					if (status === 404 || status === 410) {
						gone.push(sub.id);
						break;
					}
				} catch (err) {
					console.error('push failed', (err as Error).message);
				}
			}
		}
		if (gone.length)
			await this.env.DB.prepare(
				`DELETE FROM push_subscriptions WHERE id IN (${gone.map(() => '?').join(',')})`
			)
				.bind(...gone)
				.run();
		const now = Date.now();
		const logged = log.filter((m) => !m.resolve && m.tag !== 'test');
		if (logged.length)
			await this.env.DB.batch([
				this.env.DB.prepare(
					`INSERT INTO alert_log (user_id, sent_at, title, body, url, thread_id) VALUES ${logged.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')}`
				).bind(
					...logged.flatMap((m) => [
						userId,
						now,
						m.title,
						m.body,
						m.url,
						m.tag && !NON_THREAD_TAGS.has(m.tag) ? m.tag : null
					])
				),
				this.env.DB.prepare('DELETE FROM alert_log WHERE user_id = ? AND sent_at < ?').bind(
					userId,
					now - ALERT_LOG_KEEP
				)
			]);
		// Remember which threads have an alert on screen, so a resolution can update it.
		const threadIds = messages
			.filter((m) => !m.resolve && m.tag && !NON_THREAD_TAGS.has(m.tag))
			.map((m) => m.tag!);
		if (threadIds.length)
			await this.env.DB.prepare(
				`UPDATE threads SET pushed_at = ? WHERE user_id = ? AND id IN (${threadIds.map(() => '?').join(',')})`
			)
				.bind(now, userId, ...threadIds)
				.run();
	}
}
