import { subjectKey } from '../../src/lib/shared/subject';
import {
	fetchSubjects,
	laterRunPassed,
	listNotifications,
	markThreadDone,
	markThreadRead,
	muteThread,
	parseWorkflowTitle,
	subjectHtmlUrl,
	subjectNumber,
	type GhNotification,
	type SubjectRef
} from '../github';
import { snapshotOf } from '../../src/lib/shared/changes';
import { WATCHED, factsOf, type ItemRow, type ThreadRow } from './schema';
import { PollerItems, type ItemInput } from './items';
import {
	MIN,
	DAY,
	WATCH_EVERY,
	WATCH_BATCH,
	SYNC_DAYS,
	INBOX_CHECK_MAX,
	INBOX_CHECK_GAP,
	UPDATES_KEEP,
	type Who
} from './shared';

const marks = (n: number) => Array(n).fill('?').join(',');

/** The item of a notification: its PR or issue, or the thread itself. */
export function itemKeyOf(n: GhNotification): string {
	const num = subjectNumber(n);
	return num ? subjectKey(n.repository.full_name, num) : `t:${n.id}`;
}

/** Notifications in: ingest, the watcher, the GitHub read/done sync, and upkeep. */
export abstract class PollerSync extends PollerItems {
	/** GitHub writes are off in a local test copy (GITHUB_WRITES=off). */
	protected get writesOff(): boolean {
		return this.env.GITHUB_WRITES === 'off';
	}

	/**
	 * Store new or changed notifications: read their PRs and issues (the subject store), then
	 * update their items (which also pushes what came into Your turn). Returns the ids it wrote.
	 */
	protected async ingest(
		who: Who,
		items: GhNotification[],
		initialized: boolean,
		opts: { knownOrUnread?: boolean } = {}
	): Promise<string[]> {
		if (!items.length) return [];
		const existing = new Map<string, ThreadRow>();
		for (let i = 0; i < items.length; i += 90) {
			const ids = items.slice(i, i + 90).map((n) => n.id);
			for (const r of this.all<ThreadRow>(
				`SELECT * FROM threads WHERE id IN (${marks(ids.length)})`,
				...ids
			))
				existing.set(r.id, r);
		}
		const changed = items.filter(
			(n) =>
				existing.get(n.id)?.gh_updated_at !== n.updated_at &&
				// The GitHub sync lists read threads too; old ones Hush never had stay out.
				(!opts.knownOrUnread || existing.has(n.id) || n.unread)
		);
		if (!changed.length) return [];

		const refs: SubjectRef[] = changed.flatMap((n) => {
			const num = subjectNumber(n);
			return num
				? [
						{
							key: itemKeyOf(n),
							owner: n.repository.owner.login,
							repo: n.repository.name,
							number: num
						}
					]
				: [];
		});
		const fetched = await fetchSubjects(who.token, refs, who.me);
		const { before } = this.storeSubjects([...fetched.values()]);

		const now = Date.now();
		this.transaction(() => {
			for (const n of changed)
				this.run(
					`INSERT INTO threads (id, item_key, repo, subject_type, title, html_url, reason, unread, gh_updated_at, first_seen_at)
           VALUES (${marks(10)})
           ON CONFLICT (id) DO UPDATE SET item_key = excluded.item_key, repo = excluded.repo,
             subject_type = excluded.subject_type, title = excluded.title, html_url = excluded.html_url,
             reason = excluded.reason, unread = excluded.unread, gh_updated_at = excluded.gh_updated_at`,
					n.id,
					itemKeyOf(n),
					n.repository.full_name,
					n.subject.type,
					n.subject.title,
					subjectHtmlUrl(n),
					n.reason,
					n.unread ? 1 : 0,
					n.updated_at,
					now
				);
		});
		const inputs: ItemInput[] = changed.map((n) => ({
			key: itemKeyOf(n),
			repo: n.repository.full_name,
			number: subjectNumber(n),
			subjectType: n.subject.type,
			title: n.subject.title,
			url: subjectHtmlUrl(n),
			event: n.reason,
			notification: { updatedAt: n.updated_at, unread: n.unread, fresh: initialized && n.unread },
			source: 'notification',
			create: true
		}));
		await this.upsertItems(who, inputs, { quiet: !initialized, before });
		return changed.map((n) => n.id);
	}

	/**
	 * The watcher, every 15 minutes. GitHub sends no notification for your own review, reply, or
	 * push, or for CI results, merges, and closes that do not involve you. So look again at the PRs
	 * and issues in Your turn and Waiting (in rotation, WATCH_BATCH at a time; items whose subject
	 * Hush never read come first). Then copy read and done states from GitHub.
	 */
	protected async watch(who: Who, fresh: string[] = []) {
		const last = (await this.ctx.storage.get<number>('lastWatch')) ?? 0;
		if (Date.now() - last < WATCH_EVERY) return;
		await this.ctx.storage.put('lastWatch', Date.now());
		await this.syncFromGitHub(who);
		const skip = new Set(fresh);

		type Watched = Pick<ItemRow, 'key'>;
		const unread = this.all<Watched>(
			`SELECT key FROM items WHERE ${WATCHED} AND key NOT IN (SELECT key FROM subjects) LIMIT ?`,
			// At most half: a subject that cannot be read (access lost) must not stop the rotation.
			WATCH_BATCH / 2
		);
		const cursor = (await this.ctx.storage.get<string>('watchCursor')) ?? '';
		const room = WATCH_BATCH - unread.length;
		const select = (op: '>' | '<=', limit: number) =>
			this.all<Watched>(
				`SELECT key FROM items WHERE ${WATCHED} AND key ${op} ? ORDER BY key LIMIT ?`,
				cursor,
				limit
			);
		let rows = room > 0 ? select('>', room) : [];
		if (rows.length < room && cursor) rows = [...rows, ...select('<=', room - rows.length)];
		if (rows.length) await this.putChanged({ watchCursor: rows.at(-1)!.key });
		const batch = [...unread, ...rows].map((r) => r.key).filter((k) => !skip.has(k));
		// The first run after an update may move many items at once: no pushes.
		await this.refresh(who, batch, { quiet: last === 0 });
		await this.resolveWorkflowRuns(who);
	}

	/**
	 * "A workflow run failed": GitHub notifies about the failure but not about the next run that
	 * passes. Take the item out of Your turn when the newest completed run of that workflow on that
	 * branch passed after it. Up to 10 items per watch, one or two REST requests each.
	 */
	protected async resolveWorkflowRuns(who: Who) {
		const rows = this.all<Pick<ItemRow, 'key' | 'repo' | 'title' | 'activity_at' | 'sig'>>(
			`SELECT key, repo, title, activity_at, sig FROM items
       WHERE subject_type = 'CheckSuite' AND lane = 'turn' AND override IS NULL AND state = 'active'
       ORDER BY activity_at DESC LIMIT 10`
		);
		const workflows = new Map<string, Promise<{ id: number; name: string }[]>>();
		const passed = await Promise.all(
			rows.map(async (r) => {
				const w = parseWorkflowTitle(r.title);
				if (!w) return false;
				return (
					(await laterRunPassed(
						who.token,
						r.repo,
						w.workflow,
						w.branch,
						r.activity_at,
						workflows
					).catch(() => null)) === true
				);
			})
		);
		const done = rows.filter((_, k) => passed[k]);
		if (!done.length) return;
		const now = Date.now();
		const note = 'A later run passed';
		this.transaction(() => {
			for (const r of done)
				this.run(
					`UPDATE items SET override = 'updates', override_sig = sig, finished_at = ?, finished_note = ?
           WHERE key = ?`,
					now,
					note,
					r.key
				);
		});
		await this.bumpVersion();
		await this.notifyResolved(done.map((r) => ({ id: r.key, note })));
	}

	/**
	 * Copy read and done states from GitHub. The poll lists only unread threads, so a thread you
	 * read (or marked done) on GitHub never shows up there again. Read on GitHub: you saw the item.
	 * Done on GitHub: Done in Hush (until its turn changes). One to three REST requests.
	 */
	protected async syncFromGitHub(who: Who): Promise<string[]> {
		const oldest = this.one<{ t: string | null }>(
			`SELECT MIN(gh_updated_at) AS t FROM threads WHERE unread = 1`
		);
		if (!oldest?.t) return [];
		const floor = new Date(Date.now() - SYNC_DAYS * DAY).toISOString();
		const since = oldest.t > floor ? oldest.t : floor;
		// GitHub's `since` means "updated after", so ask from a little earlier: the oldest thread
		// itself must be in the list, or it would look done on GitHub.
		const askSince = new Date(Date.parse(since) - 60 * MIN).toISOString();
		let page;
		try {
			page = await listNotifications(who.token, { all: true, since: askSince, maxPages: 3 });
		} catch {
			return [];
		}
		if (page.status !== 200) return [];
		// New activity that you read on GitHub before a poll saw it.
		const ingested = await this.ingest(who, page.items, true, { knownOrUnread: true });

		const listed = new Map(page.items.map((n) => [n.id, n]));
		// "Not in the list" means done on GitHub only when the list is whole: every page read, and
		// no org hidden by SAML single sign-on.
		const whole = page.complete && !page.ssoHiddenOrgs.length;
		const rows = this.all<Pick<ThreadRow, 'id' | 'item_key'>>(
			`SELECT id, item_key FROM threads WHERE unread = 1 AND gh_updated_at >= ?`,
			since
		);
		const read = new Set<string>();
		const doneOnGitHub = new Set<string>();
		const readThreads: string[] = [];
		for (const r of rows) {
			const n = listed.get(r.id);
			if (n?.unread || (!n && !whole)) continue;
			readThreads.push(r.id);
			if (n) read.add(r.item_key);
			else doneOnGitHub.add(r.item_key);
		}
		if (readThreads.length) {
			const now = Date.now();
			const keys = [...new Set([...read, ...doneOnGitHub])];
			const seen = this.items(`items.key IN (${marks(keys.length)})`, ...keys);
			this.transaction(() => {
				for (const id of readThreads) this.run(`UPDATE threads SET unread = 0 WHERE id = ?`, id);
				for (const it of seen) {
					const f = factsOf(it);
					const snapshot = f ? JSON.stringify(snapshotOf(f, who.me)) : it.seen_snapshot;
					this.run(
						`UPDATE items SET seen_at = ?, seen_snapshot = ? WHERE key = ?`,
						now,
						snapshot,
						it.key
					);
					if (doneOnGitHub.has(it.key) && it.state === 'active' && it.lane !== 'updates')
						this.run(`UPDATE items SET state = 'done', done_sig = sig WHERE key = ?`, it.key);
				}
			});
			await this.bumpVersion();
		}
		return ingested;
	}

	/**
	 * A manual refresh also looks again at the items in Your turn (the newest 40, one GraphQL
	 * request), not only at new notifications: GitHub sends none when, for example, the author
	 * closes a PR you were asked to review.
	 */
	protected async checkTurn(): Promise<{ title: string; note: string }[]> {
		const last = (await this.ctx.storage.get<number>('lastTurnCheck')) ?? 0;
		if (Date.now() - last < INBOX_CHECK_GAP) return [];
		await this.ctx.storage.put('lastTurnCheck', Date.now());
		const who = await this.who();
		if (!who) return [];
		const rows = this.all<Pick<ItemRow, 'key'>>(
			`SELECT key FROM items WHERE COALESCE(override, lane) = 'turn' AND state = 'active'
       AND number IS NOT NULL ORDER BY activity_at DESC LIMIT ?`,
			INBOX_CHECK_MAX
		);
		const resolved = await this.refresh(
			who,
			rows.map((r) => r.key)
		);
		return resolved.map(({ title, note }) => ({ title, note }));
	}

	/** Snoozes whose time is up come back. */
	protected async wakeSnoozed() {
		const n = this.run(
			`UPDATE items SET state = 'active', snoozed_until = NULL, snooze_event = NULL, snoozed_at = NULL
       WHERE state = 'snoozed' AND snoozed_until <= ?`,
			Date.now()
		);
		if (n) await this.bumpVersion();
	}

	/**
	 * Once a day: forget items that have been out of Your turn and Waiting with no activity for 30
	 * days (and their threads), and subjects that no item refers to.
	 */
	protected async cleanup() {
		const last = (await this.ctx.storage.get<number>('lastCleanup')) ?? 0;
		if (Date.now() - last < DAY) return;
		const cutoff = new Date(Date.now() - Math.max(30 * DAY, UPDATES_KEEP)).toISOString();
		const items = this.run(
			`DELETE FROM items WHERE activity_at < ?
       AND (lane IN ('updates', 'muted') OR state IN ('done', 'muted'))`,
			cutoff
		);
		this.run(`DELETE FROM threads WHERE item_key NOT IN (SELECT key FROM items)`);
		this.run(
			`DELETE FROM subjects WHERE changed_at < ? AND key NOT IN (SELECT key FROM items)`,
			Date.now() - 30 * DAY
		);
		if (items) await this.bumpVersion();
		await this.ctx.storage.put('lastCleanup', Date.now());
	}

	/** Mirror a choice on GitHub: read, done, or muted (the notification threads of these items). */
	protected mirrorOnGitHub(token: string, keys: string[], action: 'read' | 'done' | 'mute') {
		if (this.writesOff || !keys.length) return;
		const threads = this.all<Pick<ThreadRow, 'id' | 'unread'>>(
			`SELECT id, unread FROM threads WHERE item_key IN (${marks(keys.length)})`,
			...keys
		);
		const calls = threads
			.filter((t) => action !== 'read' || t.unread)
			.map((t) =>
				action === 'read'
					? markThreadRead(token, t.id)
					: action === 'done'
						? markThreadDone(token, t.id)
						: muteThread(token, t.id).then(() => markThreadDone(token, t.id))
			);
		if (action === 'read' || action === 'done')
			this.run(`UPDATE threads SET unread = 0 WHERE item_key IN (${marks(keys.length)})`, ...keys);
		this.ctx.waitUntil(Promise.allSettled(calls));
	}
}
