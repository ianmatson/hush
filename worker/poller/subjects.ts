import { classify, shouldPush } from '../../src/lib/shared/classify';
import { finishItem, keepItem, sortItems } from '../../src/lib/shared/dashboard';
import { watchOutcome } from '../../src/lib/shared/watch';
import type { DashResponse, Enrichment, Settings } from '../../src/lib/shared/types';
import {
	dashFactsOf,
	enrichmentOf,
	subjectKey,
	subjectUrls,
	type SubjectFacts
} from '../../src/lib/shared/subject';
import { bumpVersion, type ThreadRow } from '../db';
import { fetchSubjects } from '../github';
import type { PushMessage } from '../webpush';
import { MAX_INDIVIDUAL_PUSHES, type Who, type Resolved, subjectRefOf } from './shared';
import { PollerAlerts } from './alerts';

/** The subject store: every GitHub read of a PR or issue goes through recordSubjects, which updates the inbox threads and the cached dashboards. */
export abstract class PollerSubjects extends PollerAlerts {
	/**
	 * Look again at these threads' PRs and issues and apply watchOutcome. Writes only threads
	 * that changed. Returns the ones it moved to Done, for a toast.
	 */
	protected async refresh(
		userId: number,
		me: string,
		token: string,
		settings: Settings,
		myTeams: string[],
		rows: ThreadRow[],
		opts: { quiet?: boolean } = {}
	): Promise<Resolved[]> {
		const refs = rows.flatMap((r) => {
			const ref = subjectRefOf(r);
			return ref ? [ref] : [];
		});
		if (!refs.length) return [];
		const fresh = await fetchSubjects(token, refs, me);
		const who: Who = { userId, me, settings, inboxTeams: myTeams };
		// Store the facts (and update the dashboards); these threads are applied below, also when
		// their subject did not change, so a thread that missed an update catches up.
		await this.recordSubjects(who, [...fresh.values()], { threads: false });
		const byThread = new Map(
			rows.flatMap((r) => (fresh.has(r.id) ? [[r.id, fresh.get(r.id)!]] : []))
		);
		return (await this.applyFacts(who, rows, (r) => byThread.get(r.id), opts)).resolved;
	}

	/**
	 * The one write path for PR and issue facts from GitHub. Stores each subject whose facts
	 * changed (unchanged ones cost one read), then updates every view of it: the cached dashboards
	 * and the inbox threads about it. Callers that write those threads themselves pass
	 * `threads: false`; the dashboard build passes `dash: false`.
	 */
	protected async recordSubjects(
		who: Who,
		subjects: SubjectFacts[],
		opts: { threads?: boolean; dash?: boolean; quiet?: boolean } = {}
	): Promise<{ changed: SubjectFacts[]; resolved: Resolved[]; wrote: number }> {
		const db = this.env.DB;
		const byKey = new Map(subjects.map((x) => [subjectKey(x.repo, x.number), x]));
		const keys = [...byKey.keys()];
		const stored = new Map<string, string>();
		for (let i = 0; i < keys.length; i += 90) {
			const chunk = keys.slice(i, i + 90);
			const { results } = await db
				.prepare(
					`SELECT key, facts FROM subjects WHERE user_id = ? AND key IN (${chunk.map(() => '?').join(',')})`
				)
				.bind(who.userId, ...chunk)
				.all<{ key: string; facts: string }>();
			for (const r of results) stored.set(r.key, r.facts);
		}
		const changed = [...byKey].filter(([k, x]) => stored.get(k) !== JSON.stringify(x));
		if (!changed.length) return { changed: [], resolved: [], wrote: 0 };
		const now = Date.now();
		await db.batch(
			changed.map(([k, x]) =>
				db
					.prepare(
						`INSERT INTO subjects (user_id, key, facts, changed_at) VALUES (?, ?, ?, ?)
             ON CONFLICT (user_id, key) DO UPDATE SET facts = excluded.facts, changed_at = excluded.changed_at`
					)
					.bind(who.userId, k, JSON.stringify(x), now)
			)
		);
		const subs = changed.map(([, x]) => x);
		if (opts.dash !== false) await this.patchDashCaches(who, subs);
		if (opts.threads === false) return { changed: subs, resolved: [], wrote: 0 };

		const urls = changed.flatMap(([k]) => subjectUrls(k));
		const rows: ThreadRow[] = [];
		for (let i = 0; i < urls.length; i += 90) {
			const chunk = urls.slice(i, i + 90);
			const { results } = await db
				.prepare(
					`SELECT * FROM threads WHERE user_id = ? AND category != 'muted'
           AND html_url IN (${chunk.map(() => '?').join(',')})`
				)
				.bind(who.userId, ...chunk)
				.all<ThreadRow>();
			rows.push(...results);
		}
		const keyOf = (r: ThreadRow) => {
			const ref = subjectRefOf(r);
			return ref ? subjectKey(`${ref.owner}/${ref.repo}`, ref.number) : null;
		};
		const out = await this.applyFacts(who, rows, (r) => byKey.get(keyOf(r) ?? ''), opts);
		return { changed: subs, ...out };
	}

	/** Replace changed subjects in the cached dashboards (and drop the ones that closed). */
	protected async patchDashCaches(who: Who, subs: SubjectFacts[]) {
		if (!subs.length) return;
		const { dash, botsAreFyi, reviewResolution } = who.settings;
		let teamSet: Set<string> | null = null;
		for (const kind of ['pr', 'issue'] as const) {
			const key = `dash:${kind}`;
			const cached = await this.ctx.storage.get<{ sig: string; data: DashResponse }>(key);
			const byId = new Map(subs.filter((x) => x.kind === kind).map((x) => [x.id, x]));
			if (!cached || !cached.data.items.some((i) => byId.has(i.id))) continue;
			teamSet ??= new Set((await this.teams()).teams.map((t) => t.slug));
			const names = Object.fromEntries(cached.data.sections.map((x) => [x.id, x.name]));
			const items = sortItems(
				cached.data.items.flatMap((i) => {
					const sub = byId.get(i.id);
					if (!sub) return [i];
					const f = dashFactsOf(sub, who.me, teamSet!);
					if (f.state !== 'open' || !keepItem(f, who.me, dash)) return [];
					return [
						finishItem(
							f,
							i.sections,
							i.sections.map((x) => names[x] ?? x),
							who.me,
							dash.staleDays,
							Date.now(),
							{ botsAreFyi, reviewResolution }
						)
					];
				})
			);
			const data: DashResponse = {
				...cached.data,
				items,
				sections: cached.data.sections.map((x) => ({
					...x,
					count: items.filter((i) => i.sections.includes(x.id)).length
				}))
			};
			await this.ctx.storage.put(key, { sig: cached.sig, data });
		}
	}

	/**
	 * Apply fresh facts to inbox threads: classify, then watchOutcome (resolve, reopen, wake).
	 * Writes only threads that changed, and pushes what now needs you.
	 */
	protected async applyFacts(
		who: Who,
		rows: ThreadRow[],
		subjectOf: (r: ThreadRow) => SubjectFacts | undefined,
		opts: { quiet?: boolean } = {}
	): Promise<{ resolved: Resolved[]; wrote: number }> {
		const { userId, me, settings, inboxTeams: myTeams } = who;
		const db = this.env.DB;
		const stmts: D1PreparedStatement[] = [];
		const messages: PushMessage[] = [];
		const resolved: Resolved[] = [];
		for (const r of rows) {
			// No data (deleted, access lost, GitHub error): change nothing. Snooze deadlines still end.
			const sub = subjectOf(r);
			if (!sub) continue;
			const e = enrichmentOf(sub, me);
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
		if (resolved.length && !opts.quiet) await this.notifyResolved(resolved);
		return { resolved, wrote: stmts.length };
	}

	/**
	 * Check one PR or issue now: you just came back to Hush from it on GitHub. Stores its facts,
	 * which updates its inbox threads and its entry in the cached dashboards. About 1 point.
	 */
	async recheck(
		repo: string,
		number: number
	): Promise<{ resolved: { title: string; note: string }[] }> {
		const who = await this.who();
		if (!who) return { resolved: [] };
		const [owner, name] = repo.split('/');
		const key = subjectKey(repo, number);
		const fresh = await fetchSubjects(who.token, [{ key, owner, repo: name, number }], who.me);
		const sub = fresh.get(key);
		if (!sub) return { resolved: [] };
		return { resolved: (await this.applySubject(who, sub)).resolved };
	}

	/**
	 * Facts that the API fetched (the peek): store them and update every view. `changed` tells the
	 * browser to refetch its lists.
	 */
	async recordFetched(
		sub: SubjectFacts
	): Promise<{ changed: boolean; resolved: { title: string; note: string }[] }> {
		const who = await this.who();
		if (!who) return { changed: false, resolved: [] };
		const out = await this.applySubject(who, sub);
		return { changed: out.changed, resolved: out.resolved };
	}

	/** Store one subject, then apply it to its threads (also when it did not change). */
	protected async applySubject(
		who: Who,
		sub: SubjectFacts
	): Promise<{ changed: boolean; resolved: { title: string; note: string }[] }> {
		const stored = await this.recordSubjects(who, [sub], { threads: false });
		const rows = await this.threadsOf(who.userId, subjectKey(sub.repo, sub.number));
		const out = await this.applyFacts(who, rows, () => sub);
		return {
			changed: stored.changed.length > 0 || out.wrote > 0,
			resolved: out.resolved.map(({ title, note }) => ({ title, note }))
		};
	}
}
