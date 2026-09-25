import { DurableObject } from 'cloudflare:workers';
import { classify, shouldPush } from '../src/lib/shared/classify';
import { expandSections, finishItem, keepItem, sortItems } from '../src/lib/shared/dashboard';
import { snoozeEvent, snoozeOutcome } from '../src/lib/shared/snooze';
import { REOPEN_WINDOW_MS, watchOutcome } from '../src/lib/shared/watch';
import type {
	Classification,
	DashKind,
	DashResponse,
	Enrichment,
	Settings,
	TeamDTO,
	ThreadFacts
} from '../src/lib/shared/types';
import type { DashFacts } from '../src/lib/shared/dashboard';
import { bumpVersion, getUser, parseSettings, userToken, type Env, type ThreadRow } from './db';
import { allowedOrgs, checkAccess } from './access';
import {
	enrichSubjects,
	fetchSubjectFacts,
	fetchTeams,
	laterRunPassed,
	listNotifications,
	parseWorkflowTitle,
	searchDashboard,
	subjectHtmlUrl,
	subjectNumber,
	type GhNotification,
	type SubjectRef
} from './github';
import { sendPush, vapidFromEnv, type PushMessage } from './webpush';

const MIN = 60_000;
const ACTIVE_WINDOW = 15 * MIN;
const FIRST_SYNC_DAYS = 14;
const MAX_INDIVIDUAL_PUSHES = 3;
const TEAMS_TTL = 6 * 60 * MIN;
const DAY = 24 * 60 * MIN;
// Stop polling for accounts nobody uses. Opening Hush (or signing in) starts it again.
const PAUSE_AFTER_NO_PUSH = 14 * DAY;
const PAUSE_AFTER_WITH_PUSH = 90 * DAY;
const ACCESS_RECHECK = DAY;
// The inbox watcher: how often it looks again at open PR and issue threads (see watch()), and
// how many threads it checks each time (two GraphQL requests of 40).
const WATCH_EVERY = 15 * MIN;
const WATCH_BATCH = 80;
// Read and done states come from GitHub for threads updated in this window.
const SYNC_DAYS = 14;
// Poll every 5 minutes while someone can see the result (push on, or Hush open lately), else
// every 15. Push arrives a few minutes late, but each user costs a fifth of the Cloudflare budget.
const POLL_ACTIVE = 5 * MIN;
const POLL_IDLE = 15 * MIN;
const DASH_TTL = 15 * MIN;
export const MUTED_BY_USER = 'Muted by you';

export interface PollStatus {
	lastPollAt: number | null;
	lastError: string | null;
	nextPollAt: number | null;
	/** Orgs whose notifications GitHub hides until the token is SAML-authorized. */
	ssoHiddenOrgs: number;
}

type Existing = Pick<
	ThreadRow,
	| 'id'
	| 'gh_updated_at'
	| 'triage'
	| 'pushed_updated_at'
	| 'enrichment'
	| 'category'
	| 'rule'
	| 'snooze_event'
	| 'snoozed_at'
>;

/** Threads the watcher looks at: open PR and issue work. ?1 user id, ?2 the reopen cutoff. */
const WATCHED = `user_id = ?1 AND subject_type IN ('PullRequest', 'Issue') AND category != 'muted'
  AND (triage = 'inbox' OR (triage = 'snoozed' AND snooze_event IS NOT NULL)
       OR (triage = 'done' AND resolved_at > ?2))`;

/** Owner, repo, and number of a stored thread's PR or issue. */
function subjectRefOf(
	r: Pick<ThreadRow, 'id' | 'repo' | 'enrichment' | 'html_url'>
): SubjectRef | null {
	const [owner, repo] = r.repo.split('/');
	const num =
		(r.enrichment ? (JSON.parse(r.enrichment) as Enrichment).number : undefined) ??
		Number(r.html_url.match(/\/(?:pull|issues)\/(\d+)$/)?.[1]);
	return owner && repo && num ? { key: r.id, owner, repo, number: num } : null;
}

const clearSnooze = (db: D1Database, userId: number, id: string) =>
	db
		.prepare(
			`UPDATE threads SET snoozed_until = NULL, snooze_event = NULL WHERE user_id = ? AND id = ?`
		)
		.bind(userId, id);

/**
 * One Durable Object per user. An alarm polls the GitHub Notifications API, enriches changed
 * threads, classifies them, writes them to D1, and sends Web Push for new Action items.
 */
export class Poller extends DurableObject<Env> {
	private running: Promise<void> | null = null;
	private dashInflight = new Map<DashKind, Promise<DashResponse>>();
	/** Time of the last good poll by this instance. Covers the moment between alarms (no alarm set). */
	private lastGoodPoll = 0;

	async start(userId: number, origin: string): Promise<void> {
		// Signing in redoes the first sync (the last 14 days). A new token can see threads the old one
		// could not, and D1 may have been reset. Existing threads keep their triage state.
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
		await this.ctx.storage.setAlarm(Date.now() + 500);
	}

	async stop(): Promise<void> {
		await this.ctx.storage.deleteAlarm();
		await this.ctx.storage.deleteAll();
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
		return this.status();
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

	/** Write only the values that changed. Each written key counts against the daily row budget. */
	private async putChanged(values: Record<string, unknown>): Promise<void> {
		const old = await this.ctx.storage.get(Object.keys(values));
		const changed = Object.fromEntries(
			Object.entries(values).filter(([k, v]) => JSON.stringify(old.get(k)) !== JSON.stringify(v))
		);
		if (Object.keys(changed).length) await this.ctx.storage.put(changed);
	}

	/** Your GitHub teams, cached for 6 hours. */
	async teams(force = false): Promise<{ teams: TeamDTO[]; error?: string }> {
		const cached = await this.ctx.storage.get<{ teams: TeamDTO[]; at: number }>('teams');
		if (!force && cached && Date.now() - cached.at < TEAMS_TTL) return { teams: cached.teams };
		const userId = await this.ctx.storage.get<number>('userId');
		const user = userId ? await getUser(this.env, userId) : null;
		if (!user) return { teams: cached?.teams ?? [], error: 'Not signed in.' };
		const res = await fetchTeams(await userToken(this.env, user), user.login);
		if (res.error && cached) return { teams: cached.teams, error: res.error };
		await this.ctx.storage.put('teams', { teams: res.teams, at: Date.now() });
		return res;
	}

	/** Live PR or issue dashboard from saved searches, cached for 15 minutes. */
	dashboard(kind: DashKind, force = false): Promise<DashResponse> {
		let p = this.dashInflight.get(kind);
		if (!p) {
			p = this.buildDashboard(kind, force).finally(() => this.dashInflight.delete(kind));
			this.dashInflight.set(kind, p);
		}
		return p;
	}

	private async buildDashboard(kind: DashKind, force: boolean): Promise<DashResponse> {
		const userId = await this.ctx.storage.get<number>('userId');
		const user = userId ? await getUser(this.env, userId) : null;
		if (!user) throw new Error('Not signed in.');
		const { dash, botsAreFyi } = parseSettings(user.settings);
		const sig = JSON.stringify([
			botsAreFyi,
			dash[kind],
			dash.scope,
			dash.excludedTeams,
			dash.staleDays,
			dash.hideOthersDrafts,
			dash.hideBots
		]);
		const key = `dash:${kind}`;
		const cached = await this.ctx.storage.get<{ sig: string; data: DashResponse }>(key);
		if (!force && cached?.sig === sig && Date.now() - cached.data.fetchedAt < DASH_TTL)
			return cached.data;

		const { teams, error: teamError } = await this.teams();
		const { queries, skipped } = expandSections(dash[kind], dash, teams);
		// Each search asks for about its last count (GitHub prices what a search asks for).
		const countsKey = `dash:counts:${kind}`;
		const lastCounts = (await this.ctx.storage.get<Record<string, number>>(countsKey)) ?? {};
		const { hits, errors, counts } = await searchDashboard(
			await userToken(this.env, user),
			user.login,
			new Set(teams.map((t) => t.slug)),
			queries,
			lastCounts
		);
		await this.putChanged({ [countsKey]: counts });

		const byId = new Map<string, { facts: DashFacts; sections: Set<string> }>();
		for (const h of hits) {
			const e = byId.get(h.facts.id) ?? { facts: h.facts, sections: new Set<string>() };
			e.sections.add(h.section);
			byId.set(h.facts.id, e);
		}
		const enabled = dash[kind].filter((s) => s.enabled);
		const items = sortItems(
			[...byId.values()]
				.filter(({ facts }) => keepItem(facts, user.login, dash))
				.map(({ facts, sections }) => {
					const ordered = enabled.filter((s) => sections.has(s.id));
					return finishItem(
						facts,
						ordered.map((s) => s.id),
						ordered.map((s) => s.name),
						user.login,
						dash.staleDays,
						Date.now(),
						{ botsAreFyi }
					);
				})
		);
		const data: DashResponse = {
			kind,
			items,
			sections: enabled.map((s) => ({
				id: s.id,
				name: s.name,
				count: items.filter((i) => i.sections.includes(s.id)).length,
				...(skipped[s.id] ? { skipped: skipped[s.id] } : {})
			})),
			teams,
			fetchedAt: Date.now(),
			errors: teamError ? [teamError, ...errors] : errors
		};
		await this.ctx.storage.put(key, { sig, data });
		return data;
	}

	async alarm(): Promise<void> {
		await this.runOnce();
		await this.schedule();
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
		const userId = await this.ctx.storage.get<number>('userId');
		if (!userId) return;
		const user = await getUser(this.env, userId);
		if (!user) return this.stop();

		let token: string;
		try {
			token = await userToken(this.env, user);
		} catch {
			return this.fail('Could not decrypt the stored token. Sign in again.', { stop: true });
		}
		if (!(await this.recheckAccess(user.id, token, user.access_checked_at))) return;
		const settings = parseSettings(user.settings);
		const initialized = (await this.ctx.storage.get<boolean>('initialized')) ?? false;
		const lastModified = await this.ctx.storage.get<string>('lastModified');

		let page;
		try {
			page = await listNotifications(
				token,
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
			await this.wakeSnoozed(userId);
			return this.watch(userId, user.login, token, settings);
		}
		await this.putChanged({ ssoHiddenOrgs: page.ssoHiddenOrgs });

		const myTeams = settings.teamReviewsAreAction
			? (await this.teams()).teams.map((t) => t.slug)
			: [];
		const ingested = await this.ingest(
			userId,
			user.login,
			token,
			settings,
			page.items,
			initialized,
			myTeams
		);
		// Save Last-Modified only after the threads are stored. If ingest fails, the next poll
		// asks GitHub again instead of getting a 304 and losing those notifications.
		await this.ctx.storage.put({
			initialized: true,
			...(page.lastModified ? { lastModified: page.lastModified } : {})
		});
		await this.wakeSnoozed(userId);
		await this.watch(userId, user.login, token, settings, ingested);
		await this.cleanup(userId);
	}

	private async ingest(
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
		const enriched = await enrichSubjects(token, refs, me);

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

	private async push(userId: number, items: { n: GhNotification; c: Classification }[]) {
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

		await this.send(userId, messages);
	}

	/** Send push messages to every device of the user; forget devices the push service dropped. */
	private async send(userId: number, messages: PushMessage[]) {
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
	}

	/**
	 * The inbox watcher, every 15 minutes. GitHub sends no notification for your own review,
	 * reply, or push, or for CI results, merges, and closes that do not involve you. So look again
	 * at the open PR and issue threads (in rotation, WATCH_BATCH at a time), and let watchOutcome
	 * move each one: resolved actions go to Done, closed FYIs go to Done, conditional snoozes wake,
	 * and threads Hush resolved come back if they need you again. Then copy read and done states
	 * from GitHub.
	 */
	private async watch(
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
	private async resolveWorkflowRuns(userId: number, token: string) {
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
	}

	/**
	 * Look again at these threads' PRs and issues and apply watchOutcome. Writes only threads
	 * that changed. Returns the ones it moved to Done, for a toast.
	 */
	private async refresh(
		userId: number,
		me: string,
		token: string,
		settings: Settings,
		myTeams: string[],
		rows: ThreadRow[],
		opts: { quiet?: boolean } = {}
	): Promise<{ id: string; title: string; note: string }[]> {
		const refs = rows.flatMap((r) => {
			const ref = subjectRefOf(r);
			return ref ? [ref] : [];
		});
		if (!refs.length) return [];
		const fresh = await enrichSubjects(token, refs, me);

		const db = this.env.DB;
		const stmts: D1PreparedStatement[] = [];
		const messages: PushMessage[] = [];
		const resolved: { id: string; title: string; note: string }[] = [];
		for (const r of rows) {
			// No data (deleted, access lost, GitHub error): change nothing. Snooze deadlines still end.
			const e = fresh.get(r.id);
			if (!e) continue;
			const before = r.enrichment ? (JSON.parse(r.enrichment) as Enrichment) : null;
			const c = classify(
				{
					repo: r.repo,
					subjectType: r.subject_type,
					title: r.title,
					reason: r.reason,
					htmlUrl: r.html_url,
					enrichment: e,
					me,
					myTeams
				},
				settings
			);
			const out = watchOutcome(
				{
					category: r.category,
					kind: r.kind,
					triage: r.triage,
					enrichment: before,
					resolvedAt: r.resolved_at,
					snoozeEvent: r.snooze_event,
					snoozedAt: r.snoozed_at
				},
				c,
				e,
				me
			);
			const note = out.triage === 'done' ? (out.resolvedNote ?? r.resolved_note) : null;
			const same =
				JSON.stringify(e) === r.enrichment &&
				c.category === r.category &&
				c.kind === r.kind &&
				c.summary === r.summary &&
				c.actionLabel === r.action_label &&
				c.actionUrl === r.action_url &&
				(c.rule ?? null) === r.rule &&
				out.triage === r.triage &&
				out.resolvedAt === r.resolved_at &&
				note === r.resolved_note &&
				!out.clearSnooze;
			if (same) continue;
			stmts.push(
				db
					.prepare(
						`UPDATE threads SET enrichment = ?, category = ?, kind = ?, summary = ?, action_label = ?,
               action_url = ?, rule = ?, triage = ?, resolved_at = ?, resolved_note = ?,
               snoozed_until = CASE WHEN ? THEN NULL ELSE snoozed_until END,
               snooze_event = CASE WHEN ? THEN NULL ELSE snooze_event END
             WHERE user_id = ? AND id = ?`
					)
					.bind(
						JSON.stringify(e),
						c.category,
						c.kind,
						c.summary,
						c.actionLabel,
						c.actionUrl,
						c.rule ?? null,
						out.triage,
						out.resolvedAt,
						note,
						out.clearSnooze ? 1 : 0,
						out.clearSnooze ? 1 : 0,
						userId,
						r.id
					)
			);
			if (out.resolvedNote) resolved.push({ id: r.id, title: r.title, note: out.resolvedNote });
			const snoozeOver = out.push?.startsWith('Snooze over') ?? false;
			const wanted = snoozeOver
				? settings.pushAction
				: settings.pushTurnChanges && shouldPush(c, settings);
			if (out.push && wanted)
				messages.push({
					title: out.push,
					body: `${r.title}\n${r.repo}`,
					url: c.actionUrl,
					tag: r.id
				});
		}
		if (stmts.length) await db.batch([...stmts, bumpVersion(this.env, userId)]);
		if (messages.length && !opts.quiet)
			await this.send(userId, messages.slice(0, MAX_INDIVIDUAL_PUSHES));
		return resolved;
	}

	/**
	 * Copy read and done states from GitHub. The poll lists only unread threads, so a thread you
	 * read (or marked done) on GitHub never shows up there again. One to three REST requests.
	 */
	private async syncFromGitHub(
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
			}
		}
		if (stmts.length) await db.batch([...stmts, bumpVersion(this.env, userId)]);
		return ingested;
	}

	/**
	 * Check one PR or issue now: you just came back to Hush from it on GitHub. Updates its inbox
	 * threads and its entry in the cached dashboards. About 2 points.
	 */
	async recheck(
		repo: string,
		number: number
	): Promise<{ resolved: { title: string; note: string }[] }> {
		const userId = await this.ctx.storage.get<number>('userId');
		const user = userId ? await getUser(this.env, userId) : null;
		if (!user) return { resolved: [] };
		const token = await userToken(this.env, user);
		const settings = parseSettings(user.settings);
		const teams = (await this.teams()).teams.map((t) => t.slug);
		const { results: rows } = await this.env.DB.prepare(
			`SELECT * FROM threads WHERE user_id = ? AND html_url IN (?, ?) AND category != 'muted'`
		)
			.bind(
				user.id,
				`https://github.com/${repo}/pull/${number}`,
				`https://github.com/${repo}/issues/${number}`
			)
			.all<ThreadRow>();
		const [resolved] = await Promise.all([
			this.refresh(
				user.id,
				user.login,
				token,
				settings,
				settings.teamReviewsAreAction ? teams : [],
				rows
			),
			this.patchDashboards(token, user.login, settings, new Set(teams), repo, number)
		]);
		return { resolved: resolved.map(({ title, note }) => ({ title, note })) };
	}

	/** Replace one item in the cached dashboards with fresh facts (or drop it once it closed). */
	private async patchDashboards(
		token: string,
		me: string,
		settings: Settings,
		myTeams: Set<string>,
		repo: string,
		number: number
	) {
		const [owner, name] = repo.split('/');
		const facts = await fetchSubjectFacts(token, me, myTeams, owner, name, number);
		if (!facts) return;
		const key = `dash:${facts.kind}`;
		const cached = await this.ctx.storage.get<{ sig: string; data: DashResponse }>(key);
		const old = cached?.data.items.find((i) => i.id === facts.id);
		if (!cached || !old) return;
		const names = Object.fromEntries(cached.data.sections.map((s) => [s.id, s.name]));
		const rest = cached.data.items.filter((i) => i.id !== facts.id);
		const items =
			facts.state === 'open'
				? sortItems([
						...rest,
						finishItem(
							facts,
							old.sections,
							old.sections.map((s) => names[s] ?? s),
							me,
							settings.dash.staleDays,
							Date.now(),
							{ botsAreFyi: settings.botsAreFyi }
						)
					])
				: rest;
		const data: DashResponse = {
			...cached.data,
			items,
			sections: cached.data.sections.map((s) => ({
				...s,
				count: items.filter((i) => i.sections.includes(s.id)).length
			}))
		};
		await this.ctx.storage.put(key, { sig: cached.sig, data });
	}

	private async wakeSnoozed(userId: number) {
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
	private async recheckAccess(
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
	private async cleanup(userId: number) {
		const last = (await this.ctx.storage.get<number>('lastCleanup')) ?? 0;
		if (Date.now() - last < 24 * 60 * MIN) return;
		const cutoff = new Date(Date.now() - 30 * 24 * 60 * MIN).toISOString();
		const res = await this.env.DB.prepare(
			`DELETE FROM threads WHERE user_id = ? AND triage = 'done' AND gh_updated_at < ?`
		)
			.bind(userId, cutoff)
			.run();
		if (res.meta.changes) await bumpVersion(this.env, userId).run();
		await this.ctx.storage.put('lastCleanup', Date.now());
	}
}
