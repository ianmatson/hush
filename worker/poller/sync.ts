import { classify, ruleTriage, shouldPush, withOverride } from '../../src/lib/shared/classify';
import { snoozeEvent, snoozeOutcome } from '../../src/lib/shared/snooze';
import { REOPEN_WINDOW_MS } from '../../src/lib/shared/watch';
import type { ThreadFacts } from '../../src/lib/shared/types';
import { enrichmentOf, subjectKey } from '../../src/lib/shared/subject';
import {
	fetchSubjects,
	laterRunPassed,
	listNotifications,
	parseWorkflowTitle,
	subjectHtmlUrl,
	subjectNumber,
	type GhNotification,
	type SubjectRef
} from '../github';
import { SNOOZE_OVER_REASON, type PushCandidate } from './alerts';
import { enrichmentFor, WATCHED, type ThreadRow, type ThreadWithFacts } from './schema';
import {
	MIN,
	DAY,
	WATCH_EVERY,
	WATCH_BATCH,
	SYNC_DAYS,
	INBOX_CHECK_MAX,
	INBOX_CHECK_GAP,
	MUTED_BY_USER,
	type Who
} from './shared';
import { PollerSubjects } from './subjects';

const marks = (n: number) => Array(n).fill('?').join(',');

/** Notifications in: ingest, the watcher, the GitHub read/done sync, and upkeep. */
export abstract class PollerSync extends PollerSubjects {
	/**
	 * Store new or changed notifications: read their PRs and issues (the subject store), classify,
	 * and push what needs you. Returns the ids it wrote.
	 */
	protected async ingest(
		who: Who,
		items: GhNotification[],
		initialized: boolean,
		opts: { knownOrUnread?: boolean } = {}
	): Promise<string[]> {
		if (!items.length) return [];
		const { me, settings, inboxTeams: myTeams } = who;
		const existing = new Map<string, ThreadWithFacts>();
		for (let i = 0; i < items.length; i += 90) {
			const ids = items.slice(i, i + 90).map((n) => n.id);
			for (const r of this.threads(`id IN (${marks(ids.length)})`, ...ids)) existing.set(r.id, r);
		}
		// Threads stored before their API address was kept get it now (one write each, once).
		const fill = items.filter((n) => n.subject.url && existing.get(n.id)?.api_url === null);
		if (fill.length)
			this.transaction(() => {
				for (const n of fill)
					this.run('UPDATE threads SET api_url = ? WHERE id = ?', n.subject.url, n.id);
			});
		const changed = items.filter(
			(n) =>
				existing.get(n.id)?.gh_updated_at !== n.updated_at &&
				// The GitHub sync lists read threads too; old ones Hush never had stay out.
				(!opts.knownOrUnread || existing.has(n.id) || n.unread)
		);
		if (!changed.length) return [];

		const refs: SubjectRef[] = [];
		for (const n of changed) {
			const num = subjectNumber(n);
			if (num)
				refs.push({
					key: n.id,
					owner: n.repository.owner.login,
					repo: n.repository.name,
					number: num
				});
		}
		const fetched = await fetchSubjects(who.token, refs, me);
		// Store the facts; this ingest writes these threads itself.
		await this.record(who, [...fetched.values()], { threads: false, allAreInboxThreads: true });
		const decided = this.decisionsOf(who, [...fetched.values()]);

		const now = Date.now();
		const candidates: PushCandidate[] = [];
		const writes: (() => void)[] = [];
		for (const n of changed) {
			const ex = existing.get(n.id);
			const sub = fetched.get(n.id);
			const num = subjectNumber(n);
			const key = sub
				? subjectKey(sub.repo, sub.number)
				: num
					? subjectKey(n.repository.full_name, num)
					: null;
			// No fresh read (no access, a GitHub error): the facts stored before, if any.
			const enrichment = sub
				? enrichmentOf(sub, me, key ? decided.get(key) : undefined)
				: ex
					? enrichmentFor(ex, me)
					: null;
			const facts: ThreadFacts = {
				repo: n.repository.full_name,
				subjectType: n.subject.type,
				title: n.subject.title,
				reason: n.reason,
				htmlUrl: subjectHtmlUrl(n),
				enrichment,
				me,
				myTeams
			};
			let c = withOverride(classify(facts, settings), ex, n.updated_at);
			if (ex?.category === 'muted' && ex.rule === MUTED_BY_USER)
				c = { ...c, category: 'muted', rule: MUTED_BY_USER };

			let triage: string;
			if (!ex) triage = initialized || n.unread || c.category === 'action' ? 'inbox' : 'done';
			else triage = ex.triage === 'done' ? 'inbox' : ex.triage; // New activity brings a done thread back.
			if (c.category === 'muted') triage = 'done';

			// Snoozed until something happens: this new activity may be it.
			let wokeBy: string | null = null;
			if (ex?.triage === 'snoozed' && ex.snooze_event && triage === 'snoozed') {
				const ev = snoozeEvent(ex.snooze_event);
				const outcome = ev ? snoozeOutcome(ev.id, enrichment, ex.snoozed_at ?? 0, me) : null;
				if (outcome?.wake) {
					triage = 'inbox';
					wokeBy = outcome.reason;
				}
			}
			// New activity: a rule that moves threads acts now (not for a snooze that just woke).
			const moved = triage === 'inbox' && !wokeBy ? ruleTriage(c, now) : null;
			if (moved) triage = moved.triage;
			const keepSnooze = triage === 'snoozed' && !moved;

			let pushed = ex?.pushed_updated_at ?? null;
			const itemKey = key ?? n.id;
			const body = `${n.subject.title}\n${n.repository.full_name}`;
			const isItem = !!key;
			if (isItem && wokeBy) {
				candidates.push({
					itemKey,
					reason: SNOOZE_OVER_REASON,
					ignoresRepeatSetting: true,
					pushes: settings.pushAction,
					message: { title: `Snooze over: ${wokeBy}`, body, url: c.actionUrl }
				});
				pushed = n.updated_at;
			} else if (
				isItem &&
				!moved &&
				initialized &&
				n.unread &&
				triage === 'inbox' &&
				(c.category === 'action' || shouldPush(c, settings)) &&
				pushed !== n.updated_at
			) {
				candidates.push({
					itemKey,
					reason: c.kind,
					urgent: c.category === 'action' && !!enrichment?.urgent,
					pushes: shouldPush(c, settings),
					message: { title: c.summary, body, url: c.actionUrl }
				});
				pushed = n.updated_at;
			}

			writes.push(() =>
				this.run(
					`INSERT INTO threads (id, repo, subject_type, subject_key, title, html_url, reason, unread, gh_updated_at,
             category, kind, summary, why, action_label, action_url, rule, triage, pushed_updated_at, first_seen_at,
             snoozed_until, snoozed_at, resolved_note, api_url)
           VALUES (${marks(23)})
           ON CONFLICT (id) DO UPDATE SET
             repo = excluded.repo, subject_type = excluded.subject_type, subject_key = excluded.subject_key,
             title = excluded.title, html_url = excluded.html_url, reason = excluded.reason, unread = excluded.unread,
             gh_updated_at = excluded.gh_updated_at, category = excluded.category, kind = excluded.kind,
             summary = excluded.summary, why = excluded.why, action_label = excluded.action_label,
             action_url = excluded.action_url, rule = excluded.rule, triage = excluded.triage,
             pushed_updated_at = excluded.pushed_updated_at, api_url = excluded.api_url,
             snoozed_until = CASE WHEN ${keepSnooze ? 1 : 0} THEN threads.snoozed_until ELSE excluded.snoozed_until END,
             snooze_event = CASE WHEN ${keepSnooze ? 1 : 0} THEN threads.snooze_event END,
             snoozed_at = CASE WHEN ${keepSnooze ? 1 : 0} THEN threads.snoozed_at ELSE excluded.snoozed_at END,
             resolved_at = CASE WHEN excluded.resolved_note IS NOT NULL THEN NULL
               WHEN excluded.triage = 'done' THEN threads.resolved_at END,
             resolved_note = CASE WHEN excluded.resolved_note IS NOT NULL THEN excluded.resolved_note
               WHEN excluded.triage = 'done' THEN threads.resolved_note END`,
					n.id,
					facts.repo,
					facts.subjectType,
					key,
					facts.title,
					facts.htmlUrl,
					n.reason,
					n.unread ? 1 : 0,
					n.updated_at,
					c.category,
					c.kind,
					c.summary,
					c.why,
					c.actionLabel,
					c.actionUrl,
					c.rule ?? null,
					triage,
					pushed,
					now,
					moved?.triage === 'snoozed' ? moved.until : null,
					moved?.triage === 'snoozed' ? now : null,
					moved?.triage === 'done' ? moved.note : null,
					n.subject.url ?? null
				)
			);
		}
		this.transaction(() => writes.forEach((w) => w()));
		await this.bumpVersion();
		await this.deliver(candidates);
		return changed.map((n) => n.id);
	}

	/**
	 * The inbox watcher, every 15 minutes. GitHub sends no notification for your own review,
	 * reply, or push, or for CI results, merges, and closes that do not involve you. So look again
	 * at the open PR and issue threads (in rotation, WATCH_BATCH at a time; threads whose subject
	 * Hush never read come first), and let watchOutcome move each one: resolved actions go to
	 * Done, closed FYIs go to Done, conditional snoozes wake, and threads Hush resolved come back
	 * if they need you again. Then copy read and done states from GitHub.
	 */
	protected async watch(who: Who, fresh: string[] = []) {
		const last = (await this.ctx.storage.get<number>('lastWatch')) ?? 0;
		if (Date.now() - last < WATCH_EVERY) return;
		await this.ctx.storage.put('lastWatch', Date.now());
		const synced = await this.syncFromGitHub(who);
		const skip = new Set([...fresh, ...synced]);

		const cutoff = Date.now() - REOPEN_WINDOW_MS;
		type Watched = Pick<ThreadRow, 'id' | 'subject_key'>;
		const unread = this.all<Watched>(
			`SELECT id, subject_key FROM threads WHERE ${WATCHED}
       AND subject_key NOT IN (SELECT key FROM subjects) LIMIT ?`,
			cutoff,
			// At most half: a subject that cannot be read (access lost) must not stop the rotation.
			WATCH_BATCH / 2
		);
		const cursor = (await this.ctx.storage.get<string>('watchCursor')) ?? '';
		const room = WATCH_BATCH - unread.length;
		const select = (op: '>' | '<=', limit: number) =>
			this.all<Watched>(
				`SELECT id, subject_key FROM threads WHERE ${WATCHED} AND id ${op} ? ORDER BY id LIMIT ?`,
				cutoff,
				cursor,
				limit
			);
		let rows = room > 0 ? select('>', room) : [];
		if (rows.length < room && cursor) rows = [...rows, ...select('<=', room - rows.length)];
		if (rows.length) await this.putChanged({ watchCursor: rows.at(-1)!.id });
		const batch = [...unread, ...rows].filter((r) => !skip.has(r.id));
		// The first run after an update of the rules may move many threads at once: no pushes.
		await this.refresh(who, batch, { quiet: last === 0 });
		await this.resolveWorkflowRuns(who);
	}

	/**
	 * "A workflow run failed" threads: GitHub notifies about the failure but not about the next
	 * run that passes. Move a thread to Done when the newest completed run of that workflow on that
	 * branch passed after it. Up to 10 threads per watch, one or two REST requests each.
	 */
	protected async resolveWorkflowRuns(who: Who) {
		const rows = this.all<Pick<ThreadRow, 'id' | 'repo' | 'title' | 'gh_updated_at'>>(
			`SELECT id, repo, title, gh_updated_at FROM threads
       WHERE subject_type = 'CheckSuite' AND triage = 'inbox' AND category = 'action'
       ORDER BY gh_updated_at DESC LIMIT 10`
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
						r.gh_updated_at,
						workflows
					).catch(() => null)) === true
				);
			})
		);
		const done = rows.filter((_, k) => passed[k]);
		if (!done.length) return;
		const now = Date.now();
		this.transaction(() => {
			for (const r of done)
				this.run(
					`UPDATE threads SET triage = 'done', resolved_at = ?, resolved_note = 'A later run passed' WHERE id = ?`,
					now,
					r.id
				);
		});
		await this.bumpVersion();
	}

	/**
	 * Copy read and done states from GitHub. The poll lists only unread threads, so a thread you
	 * read (or marked done) on GitHub never shows up there again. One to three REST requests.
	 */
	protected async syncFromGitHub(who: Who): Promise<string[]> {
		const oldest = this.one<{ t: string | null }>(
			`SELECT MIN(gh_updated_at) AS t FROM threads WHERE triage IN ('inbox', 'snoozed')`
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
		const rows = this.all<Pick<ThreadRow, 'id' | 'unread' | 'marked_unread_at'>>(
			`SELECT id, unread, marked_unread_at FROM threads
       WHERE triage IN ('inbox', 'snoozed') AND gh_updated_at >= ?`,
			since
		);
		const read: string[] = [];
		const doneOnGitHub: { id: string; note: string }[] = [];
		for (const r of rows) {
			const n = listed.get(r.id);
			if (n) {
				if (!r.unread || n.unread) continue;
				// "Mark as unread" in Hush wins, unless you read the thread on GitHub after it.
				const readAt = n.last_read_at ? Date.parse(n.last_read_at) : 0;
				if (r.marked_unread_at && readAt <= r.marked_unread_at) continue;
				read.push(r.id);
			} else if (whole) doneOnGitHub.push({ id: r.id, note: 'Done on GitHub' });
		}
		if (read.length || doneOnGitHub.length) {
			this.transaction(() => {
				for (const id of read)
					this.run(`UPDATE threads SET unread = 0, marked_unread_at = NULL WHERE id = ?`, id);
				this.clearPushMarks(this.itemKeysOf(read));
				for (const { id } of doneOnGitHub)
					this.run(
						`UPDATE threads SET triage = 'done', unread = 0, snoozed_until = NULL, snooze_event = NULL,
               resolved_at = NULL, resolved_note = 'Done on GitHub' WHERE id = ?`,
						id
					);
			});
			await this.bumpVersion();
		}
		return ingested;
	}

	/**
	 * A manual refresh also looks again at the inbox's open PRs and issues (the newest 40, one
	 * GraphQL request), not only at new notifications. GitHub sends none when, for example, the
	 * author closes a PR you were asked to review; the watcher sees that only within 15 minutes.
	 */
	protected async checkInbox(): Promise<{ title: string; note: string }[]> {
		const last = (await this.ctx.storage.get<number>('lastInboxCheck')) ?? 0;
		if (Date.now() - last < INBOX_CHECK_GAP) return [];
		await this.ctx.storage.put('lastInboxCheck', Date.now());
		const who = await this.who();
		if (!who) return [];
		const rows = this.all<Pick<ThreadRow, 'id' | 'subject_key'>>(
			`SELECT id, subject_key FROM threads WHERE triage = 'inbox' AND category != 'muted'
       AND subject_key IS NOT NULL ORDER BY gh_updated_at DESC LIMIT ?`,
			INBOX_CHECK_MAX
		);
		const resolved = await this.refresh(who, rows);
		return resolved.map(({ title, note }) => ({ title, note }));
	}

	/** Snoozes whose time is up come back to the inbox. */
	protected async wakeSnoozed() {
		const n = this.run(
			`UPDATE threads SET triage = 'inbox', snoozed_until = NULL, snooze_event = NULL
       WHERE triage = 'snoozed' AND snoozed_until <= ?`,
			Date.now()
		);
		if (n) await this.bumpVersion();
	}

	/**
	 * Once a day: forget done threads with no activity for 30 days, and subjects that no thread
	 * refers to and that nothing changed for 30 days (the dashboards store them again).
	 */
	protected async cleanup() {
		const last = (await this.ctx.storage.get<number>('lastCleanup')) ?? 0;
		if (Date.now() - last < DAY) return;
		const cutoff = Date.now() - 30 * DAY;
		const threads = this.run(
			`DELETE FROM threads WHERE triage = 'done' AND gh_updated_at < ?`,
			new Date(cutoff).toISOString()
		);
		this.run(
			`DELETE FROM subjects WHERE changed_at < ?
       AND key NOT IN (SELECT subject_key FROM threads WHERE subject_key IS NOT NULL)`,
			cutoff
		);
		this.run(`DELETE FROM decisions WHERE key NOT IN (SELECT key FROM subjects)`);
		this.forgetOldPushMarks(Date.now());
		if (threads) await this.bumpVersion();
		await this.ctx.storage.put('lastCleanup', Date.now());
	}
}
