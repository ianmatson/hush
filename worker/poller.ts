import { DurableObject } from 'cloudflare:workers';
import { classify, shouldPush } from '../src/lib/shared/classify';
import { expandSections, finishItem, keepItem, sortItems } from '../src/lib/shared/dashboard';
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
	fetchTeams,
	listNotifications,
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
const DASH_TTL = 5 * MIN;
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
	'id' | 'gh_updated_at' | 'triage' | 'pushed_updated_at' | 'enrichment' | 'category' | 'rule'
>;

/**
 * One Durable Object per user. An alarm polls the GitHub Notifications API, enriches changed
 * threads, classifies them, writes them to D1, and sends Web Push for new Action items.
 */
export class Poller extends DurableObject<Env> {
	private running: Promise<void> | null = null;
	private dashInflight = new Map<DashKind, Promise<DashResponse>>();

	async start(userId: number, origin: string): Promise<void> {
		// Signing in redoes the first sync (the last 14 days). A new token can see threads the old one
		// could not, and D1 may have been reset. Existing threads keep their triage state.
		await this.ctx.storage.delete(['initialized', 'lastModified']);
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

	/** The UI calls this when it is open. It makes the next poll happen soon. */
	async touch(): Promise<void> {
		const now = Date.now();
		await this.ctx.storage.put('lastActive', now);
		const [alarm, lastPollAt, stopped] = await Promise.all([
			this.ctx.storage.getAlarm(),
			this.ctx.storage.get<number>('lastPollAt'),
			this.ctx.storage.get<boolean>('stopped')
		]);
		if (stopped) return;
		await this.ctx.storage.delete('paused');
		const due = (lastPollAt ?? 0) + MIN;
		if (alarm === null || alarm > due) await this.ctx.storage.setAlarm(Math.max(due, now + 500));
	}

	async pollNow(): Promise<PollStatus> {
		await this.ctx.storage.put('lastActive', Date.now());
		await this.runOnce();
		await this.schedule();
		return this.status();
	}

	async status(): Promise<PollStatus> {
		const s = await this.ctx.storage.get(['lastPollAt', 'lastError', 'ssoHiddenOrgs']);
		return {
			lastPollAt: (s.get('lastPollAt') as number) ?? null,
			lastError: (s.get('lastError') as string) ?? null,
			ssoHiddenOrgs: ((s.get('ssoHiddenOrgs') as string[] | undefined) ?? []).length,
			nextPollAt: await this.ctx.storage.getAlarm()
		};
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

	/** Live PR or issue dashboard from saved searches, cached for 5 minutes. */
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
		const { dash } = parseSettings(user.settings);
		const sig = JSON.stringify([
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
		const { hits, errors } = await searchDashboard(
			await userToken(this.env, user),
			user.login,
			new Set(teams.map((t) => t.slug)),
			queries
		);

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
						dash.staleDays
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
		const base = Math.max(Number(s.get('pollInterval') ?? 60), 60) * 1000;
		const errors = Number(s.get('errorCount') ?? 0);
		const idleFor = now - Number(s.get('lastActive') ?? 0);
		if (idleFor > (s.get('hasPush') ? PAUSE_AFTER_WITH_PUSH : PAUSE_AFTER_NO_PUSH)) {
			await this.ctx.storage.put('paused', true);
			return;
		}
		let delay: number;
		if (errors > 0) delay = Math.min(base * 2 ** errors, 30 * MIN);
		else if (s.get('hasPush') || idleFor < ACTIVE_WINDOW) delay = base;
		else delay = idleFor < 2 * 60 * MIN ? 3 * base : 5 * base;
		const retryAt = Number(s.get('retryAt') ?? 0);
		await this.ctx.storage.setAlarm(Math.max(now + delay, retryAt));
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

		await this.ctx.storage.put({
			pollInterval: page.pollInterval,
			lastPollAt: Date.now(),
			lastError: null,
			errorCount: 0,
			retryAt: 0
		});
		if (page.status === 304) return this.wakeSnoozed(userId);
		await this.ctx.storage.put('ssoHiddenOrgs', page.ssoHiddenOrgs);

		const myTeams = settings.teamReviewsAreAction
			? (await this.teams()).teams.map((t) => t.slug)
			: [];
		await this.ingest(userId, user.login, token, settings, page.items, initialized, myTeams);
		// Save Last-Modified only after the threads are stored. If ingest fails, the next poll
		// asks GitHub again instead of getting a 304 and losing those notifications.
		await this.ctx.storage.put({
			initialized: true,
			...(page.lastModified ? { lastModified: page.lastModified } : {})
		});
		await this.wakeSnoozed(userId);
		await this.cleanup(userId);
	}

	private async ingest(
		userId: number,
		me: string,
		token: string,
		settings: Settings,
		items: GhNotification[],
		initialized: boolean,
		myTeams: string[]
	) {
		if (!items.length) return;
		const db = this.env.DB;
		const now = Date.now();

		const existing = new Map<string, Existing>();
		for (let i = 0; i < items.length; i += 90) {
			const ids = items.slice(i, i + 90).map((n) => n.id);
			const { results } = await db
				.prepare(
					`SELECT id, gh_updated_at, triage, pushed_updated_at, enrichment, category, rule FROM threads
           WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`
				)
				.bind(userId, ...ids)
				.all<Existing>();
			for (const r of results) existing.set(r.id, r);
		}

		const changed = items.filter((n) => existing.get(n.id)?.gh_updated_at !== n.updated_at);
		if (!changed.length) return;

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

			let pushed = ex?.pushed_updated_at ?? null;
			if (
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
               triage = excluded.triage, pushed_updated_at = excluded.pushed_updated_at`
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
	}

	private async push(userId: number, items: { n: GhNotification; c: Classification }[]) {
		const { results: subs } = await this.env.DB.prepare(
			'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?'
		)
			.bind(userId)
			.all<{ id: string; endpoint: string; p256dh: string; auth: string }>();
		await this.ctx.storage.put('hasPush', subs.length > 0);
		if (!subs.length || !this.env.VAPID_PRIVATE_KEY) return;

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

	/** Snoozes that are due go back to the inbox, and clients see a new version. */
	private async wakeSnoozed(userId: number) {
		const res = await this.env.DB.prepare(
			`UPDATE threads SET triage = 'inbox', snoozed_until = NULL
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
