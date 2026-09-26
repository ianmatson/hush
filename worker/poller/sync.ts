import { classify, shouldPush } from '../../src/lib/shared/classify';
import { snoozeEvent, snoozeOutcome } from '../../src/lib/shared/snooze';
import { REOPEN_WINDOW_MS } from '../../src/lib/shared/watch';
import type { Classification, Enrichment, Settings, ThreadFacts } from '../../src/lib/shared/types';
import { enrichmentOf } from '../../src/lib/shared/subject';
import { bumpVersion, getUser, parseSettings, userToken, type ThreadRow } from '../db';
import { allowedOrgs, checkAccess } from '../access';
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
import type { PushMessage } from '../webpush';
import {
	MIN,
	DAY,
	ACCESS_RECHECK,
	WATCH_EVERY,
	WATCH_BATCH,
	SYNC_DAYS,
	INBOX_CHECK_MAX,
	INBOX_CHECK_GAP,
	MUTED_BY_USER,
	type Existing,
	WATCHED,
	clearSnooze
} from './shared';
import { PollerSubjects } from './subjects';

/** Notifications in: ingest, the watcher, the GitHub read/done sync, and upkeep. */
export abstract class PollerSync extends PollerSubjects {
	protected async ingest(
		userId: number,
		me: string,
		token: string,
		settings: Settings,
		items: GhNotification[],
		initialized: boolean,
		myTeams: string[],
		opts: { knownOrUnread?: boolean } = {}
	): Promise<string[]> {
		if (!items.length) return [];
		const db = this.env.DB;
		const now = Date.now();

		const existing = new Map<string, Existing>();
		for (let i = 0; i < items.length; i += 90) {
			const ids = items.slice(i, i + 90).map((n) => n.id);
			const { results } = await db
				.prepare(
					`SELECT id, gh_updated_at, triage, pushed_updated_at, enrichment, category, rule, snooze_event, snoozed_at FROM threads
           WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`
				)
				.bind(userId, ...ids)
				.all<Existing>();
			for (const r of results) existing.set(r.id, r);
		}

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
		const fetched = await fetchSubjects(token, refs, me);
		// Store the facts; this ingest writes these threads itself.
		await this.recordSubjects(
			{ userId, me, settings, inboxTeams: myTeams },
			[...fetched.values()],
			{
				threads: false
			}
		);
		const enriched = new Map([...fetched].map(([id, sub]) => [id, enrichmentOf(sub, me)]));

		const toPush: { n: GhNotification; c: Classification }[] = [];
		const woken: PushMessage[] = [];
		const stmts: D1PreparedStatement[] = [];
		for (const n of changed) {
			const ex = existing.get(n.id);
			const enrichment: Enrichment | null =
				enriched.get(n.id) ?? (ex?.enrichment ? (JSON.parse(ex.enrichment) as Enrichment) : null);
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
			let c = classify(facts, settings);
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
					stmts.push(clearSnooze(db, userId, n.id));
				}
			}

			if (ex?.snooze_event && !wokeBy && triage !== 'snoozed')
				stmts.push(clearSnooze(db, userId, n.id));

			let pushed = ex?.pushed_updated_at ?? null;
			if (wokeBy && settings.pushAction) {
				woken.push({
					title: `Snooze over: ${wokeBy}`,
					body: `${n.subject.title}\n${n.repository.full_name}`,
					url: c.actionUrl,
					tag: n.id
				});
				pushed = n.updated_at;
			} else if (
				initialized &&
				n.unread &&
				triage === 'inbox' &&
				shouldPush(c, settings) &&
				pushed !== n.updated_at
			) {
				toPush.push({ n, c });
				pushed = n.updated_at;
			}

			stmts.push(
				db
					.prepare(
						`INSERT INTO threads (user_id, id, repo, subject_type, title, html_url, reason, unread, gh_updated_at,
               enrichment, category, kind, summary, why, action_label, action_url, rule, triage, snoozed_until,
               pushed_updated_at, first_seen_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, NULL, ?19, ?20)
             ON CONFLICT (user_id, id) DO UPDATE SET
               repo = excluded.repo, subject_type = excluded.subject_type, title = excluded.title,
               html_url = excluded.html_url, reason = excluded.reason, unread = excluded.unread,
               gh_updated_at = excluded.gh_updated_at, enrichment = excluded.enrichment,
               category = excluded.category, kind = excluded.kind, summary = excluded.summary, why = excluded.why,
               action_label = excluded.action_label, action_url = excluded.action_url, rule = excluded.rule,
               triage = excluded.triage, pushed_updated_at = excluded.pushed_updated_at,
               resolved_at = CASE WHEN excluded.triage = 'done' THEN threads.resolved_at END,
               resolved_note = CASE WHEN excluded.triage = 'done' THEN threads.resolved_note END`
					)
					.bind(
						userId,
						n.id,
						facts.repo,
						facts.subjectType,
						facts.title,
						facts.htmlUrl,
						n.reason,
						n.unread ? 1 : 0,
						n.updated_at,
						enrichment ? JSON.stringify(enrichment) : null,
						c.category,
						c.kind,
						c.summary,
						c.why,
						c.actionLabel,
						c.actionUrl,
						c.rule ?? null,
						triage,
						pushed,
						now
					)
			);
		}
		stmts.push(bumpVersion(this.env, userId));
		await db.batch(stmts);
		if (toPush.length) await this.push(userId, toPush);
		if (woken.length) await this.send(userId, woken);
		return changed.map((n) => n.id);
	}

	/**
	 * The inbox watcher, every 15 minutes. GitHub sends no notification for your own review,
	 * reply, or push, or for CI results, merges, and closes that do not involve you. So look again
	 * at the open PR and issue threads (in rotation, WATCH_BATCH at a time), and let watchOutcome
	 * move each one: resolved actions go to Done, closed FYIs go to Done, conditional snoozes wake,
	 * and threads Hush resolved come back if they need you again. Then copy read and done states
	 * from GitHub.
	 */
	protected async watch(
		userId: number,
		me: string,
		token: string,
		settings: Settings,
		/** Threads this poll already looked up: the watcher skips them. */
		fresh: string[] = []
	) {
		const last = (await this.ctx.storage.get<number>('lastWatch')) ?? 0;
		if (Date.now() - last < WATCH_EVERY) return;
		await this.ctx.storage.put('lastWatch', Date.now());
		const myTeams = settings.teamReviewsAreAction
			? (await this.teams()).teams.map((t) => t.slug)
			: [];
		const synced = await this.syncFromGitHub(userId, me, token, settings, myTeams);
		const skip = new Set([...fresh, ...synced]);

		const cursor = (await this.ctx.storage.get<string>('watchCursor')) ?? '';
		const select = (op: '>' | '<=', limit: number) =>
			this.env.DB.prepare(
				`SELECT * FROM threads WHERE ${WATCHED} AND id ${op} ?3 ORDER BY id LIMIT ?4`
			)
				.bind(userId, Date.now() - REOPEN_WINDOW_MS, cursor, limit)
				.all<ThreadRow>();
		let rows = (await select('>', WATCH_BATCH)).results;
		if (rows.length < WATCH_BATCH && cursor)
			rows = [...rows, ...(await select('<=', WATCH_BATCH - rows.length)).results];
		await this.putChanged({ watchCursor: rows.at(-1)?.id ?? '' });
		rows = rows.filter((r) => !skip.has(r.id));
		// The first run after an update of the rules may move many threads at once: no pushes.
		await this.refresh(userId, me, token, settings, myTeams, rows, { quiet: last === 0 });
		await this.resolveWorkflowRuns(userId, token);
	}

	/**
	 * "A workflow run failed" threads: GitHub notifies about the failure but not about the next
	 * run that passes. Move a thread to Done when the newest completed run of that workflow on that
	 * branch passed after it. Up to 10 threads per watch, one or two REST requests each.
	 */
	protected async resolveWorkflowRuns(userId: number, token: string) {
		const db = this.env.DB;
		const { results } = await db
			.prepare(
				`SELECT id, repo, title, gh_updated_at FROM threads
         WHERE user_id = ? AND subject_type = 'CheckSuite' AND triage = 'inbox' AND category = 'action'
         ORDER BY gh_updated_at DESC LIMIT 10`
			)
			.bind(userId)
			.all<Pick<ThreadRow, 'id' | 'repo' | 'title' | 'gh_updated_at'>>();
		const workflows = new Map<string, Promise<{ id: number; name: string }[]>>();
		const passed = await Promise.all(
			results.map(async (r) => {
				const w = parseWorkflowTitle(r.title);
				if (!w) return false;
				return (
					(await laterRunPassed(
						token,
						r.repo,
						w.workflow,
						w.branch,
						r.gh_updated_at,
						workflows
					).catch(() => null)) === true
				);
			})
		);
		const stmts = results
			.filter((_, k) => passed[k])
			.map((r) =>
				db
					.prepare(
						`UPDATE threads SET triage = 'done', resolved_at = ?, resolved_note = 'A later run passed'
             WHERE user_id = ? AND id = ?`
					)
					.bind(Date.now(), userId, r.id)
			);
		if (stmts.length) await db.batch([...stmts, bumpVersion(this.env, userId)]);
		await this.notifyResolved(
			results.filter((_, k) => passed[k]).map((r) => ({ id: r.id, note: 'A later run passed' }))
		);
	}

	/**
	 * Copy read and done states from GitHub. The poll lists only unread threads, so a thread you
	 * read (or marked done) on GitHub never shows up there again. One to three REST requests.
	 */
	protected async syncFromGitHub(
		userId: number,
		me: string,
		token: string,
		settings: Settings,
		myTeams: string[]
	): Promise<string[]> {
		const db = this.env.DB;
		const oldest = await db
			.prepare(
				`SELECT MIN(gh_updated_at) AS t FROM threads WHERE user_id = ? AND triage IN ('inbox', 'snoozed')`
			)
			.bind(userId)
			.first<{ t: string | null }>();
		if (!oldest?.t) return [];
		const floor = new Date(Date.now() - SYNC_DAYS * DAY).toISOString();
		const since = oldest.t > floor ? oldest.t : floor;

		// GitHub's `since` means "updated after", so ask from a little earlier: the oldest thread
		// itself must be in the list, or it would look done on GitHub.
		const askSince = new Date(Date.parse(since) - 60 * MIN).toISOString();
		let page;
		try {
			page = await listNotifications(token, { all: true, since: askSince, maxPages: 3 });
		} catch {
			return [];
		}
		if (page.status !== 200) return [];
		// New activity that you read on GitHub before a poll saw it.
		const ingested = await this.ingest(userId, me, token, settings, page.items, true, myTeams, {
			knownOrUnread: true
		});

		const listed = new Map(page.items.map((n) => [n.id, n]));
		// "Not in the list" means done on GitHub only when the list is whole: every page read, and
		// no org hidden by SAML single sign-on.
		const whole = page.complete && !page.ssoHiddenOrgs.length;
		const { results } = await db
			.prepare(
				`SELECT id, unread, marked_unread_at FROM threads
         WHERE user_id = ? AND triage IN ('inbox', 'snoozed') AND gh_updated_at >= ?`
			)
			.bind(userId, since)
			.all<Pick<ThreadRow, 'id' | 'unread' | 'marked_unread_at'>>();
		const stmts: D1PreparedStatement[] = [];
		const doneOnGitHub: { id: string; note: string }[] = [];
		for (const r of results) {
			const n = listed.get(r.id);
			if (n) {
				if (!r.unread || n.unread) continue;
				// "Mark as unread" in Hush wins, unless you read the thread on GitHub after it.
				const readAt = n.last_read_at ? Date.parse(n.last_read_at) : 0;
				if (r.marked_unread_at && readAt <= r.marked_unread_at) continue;
				stmts.push(
					db
						.prepare(
							`UPDATE threads SET unread = 0, marked_unread_at = NULL WHERE user_id = ? AND id = ?`
						)
						.bind(userId, r.id)
				);
			} else if (whole) {
				stmts.push(
					db
						.prepare(
							`UPDATE threads SET triage = 'done', unread = 0, snoozed_until = NULL, snooze_event = NULL,
                 resolved_at = NULL, resolved_note = 'Done on GitHub'
               WHERE user_id = ? AND id = ?`
						)
						.bind(userId, r.id)
				);
				doneOnGitHub.push({ id: r.id, note: 'Done on GitHub' });
			}
		}
		if (stmts.length) await db.batch([...stmts, bumpVersion(this.env, userId)]);
		await this.notifyResolved(doneOnGitHub);
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
		const userId = await this.ctx.storage.get<number>('userId');
		const user = userId ? await getUser(this.env, userId) : null;
		if (!user) return [];
		const token = await userToken(this.env, user);
		const settings = parseSettings(user.settings);
		const myTeams = settings.teamReviewsAreAction
			? (await this.teams()).teams.map((t) => t.slug)
			: [];
		const { results: rows } = await this.env.DB.prepare(
			`SELECT * FROM threads WHERE user_id = ? AND triage = 'inbox' AND category != 'muted'
       AND subject_type IN ('PullRequest', 'Issue') ORDER BY gh_updated_at DESC LIMIT ?`
		)
			.bind(user.id, INBOX_CHECK_MAX)
			.all<ThreadRow>();
		const resolved = await this.refresh(user.id, user.login, token, settings, myTeams, rows);
		return resolved.map(({ title, note }) => ({ title, note }));
	}

	protected async wakeSnoozed(userId: number) {
		const res = await this.env.DB.prepare(
			`UPDATE threads SET triage = 'inbox', snoozed_until = NULL, snooze_event = NULL
       WHERE user_id = ? AND triage = 'snoozed' AND snoozed_until <= ?`
		)
			.bind(userId, Date.now())
			.run();
		if (res.meta.changes) await bumpVersion(this.env, userId).run();
	}

	/**
	 * Once a day, check the user is still in an allowed org. If GitHub says no, delete the account
	 * (and with it the stored token). A GitHub error is not proof, so it changes nothing.
	 */
	protected async recheckAccess(
		userId: number,
		token: string,
		checkedAt: number | null
	): Promise<boolean> {
		const orgs = allowedOrgs(this.env);
		if (!orgs.length || (checkedAt && Date.now() - checkedAt < ACCESS_RECHECK)) return true;
		const access = await checkAccess(token, orgs);
		if (access.ok) {
			await this.env.DB.prepare('UPDATE users SET access_checked_at = ? WHERE id = ?')
				.bind(Date.now(), userId)
				.run();
			return true;
		}
		if (access.reason === 'error') return true;
		console.log(`access revoked for user ${userId}: ${access.message}`);
		await this.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
		await this.stop();
		return false;
	}

	/** Once a day, forget done threads with no activity for 30 days. */
	protected async cleanup(userId: number) {
		const last = (await this.ctx.storage.get<number>('lastCleanup')) ?? 0;
		if (Date.now() - last < 24 * 60 * MIN) return;
		const cutoff = new Date(Date.now() - 30 * 24 * 60 * MIN).toISOString();
		const res = await this.env.DB.prepare(
			`DELETE FROM threads WHERE user_id = ? AND triage = 'done' AND gh_updated_at < ?`
		)
			.bind(userId, cutoff)
			.run();
		if (res.meta.changes) await bumpVersion(this.env, userId).run();
		// Subjects nothing changed for 30 days; the next read stores them again.
		await this.env.DB.prepare('DELETE FROM subjects WHERE user_id = ? AND changed_at < ?')
			.bind(userId, Date.now() - 30 * DAY)
			.run();
		await this.ctx.storage.put('lastCleanup', Date.now());
	}
}
