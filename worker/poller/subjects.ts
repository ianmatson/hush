import { classify, shouldPush } from '../../src/lib/shared/classify';
import { finishItem, keepItem, sortItems } from '../../src/lib/shared/dashboard';
import { watchOutcome } from '../../src/lib/shared/watch';
import type { DashResponse } from '../../src/lib/shared/types';
import {
	dashFactsOf,
	enrichmentOf,
	subjectKey,
	type SubjectFacts
} from '../../src/lib/shared/subject';
import { fetchSubjects } from '../github';
import type { PushMessage } from '../webpush';
import { PollerAlerts } from './alerts';
import { subjectRefOf, type ThreadRow } from './schema';
import { MAX_INDIVIDUAL_PUSHES, type Resolved, type Who } from './shared';

/** SQLite binds at most this many values per statement here; longer IN lists go in chunks. */
const CHUNK = 90;
const marks = (n: number) => Array(n).fill('?').join(',');
const parse = (json: string | undefined) => (json ? (JSON.parse(json) as SubjectFacts) : null);

/** A thread, and its subject's facts now and before this read. */
type Apply = { row: ThreadRow; fresh: SubjectFacts; before: SubjectFacts | null };

/**
 * The subject store. Every GitHub read of a PR or issue goes through `record`, which keeps the
 * one copy of its facts and updates every view of it: the inbox threads and the cached dashboards.
 */
export abstract class PollerSubjects extends PollerAlerts {
	/**
	 * Store fresh facts from GitHub, then update the views. The threads about these subjects get
	 * the facts whether or not they changed, so a thread that is out of date catches up. The
	 * dashboard build passes `dash: false` (its cache is already new); ingest passes
	 * `threads: false` (it writes those threads itself).
	 */
	protected async record(
		who: Who,
		subjects: SubjectFacts[],
		opts: { dash?: boolean; threads?: boolean; quiet?: boolean } = {}
	): Promise<{ changed: number; resolved: Resolved[]; wrote: number }> {
		const fresh = new Map(subjects.map((x) => [subjectKey(x.repo, x.number), x]));
		const keys = [...fresh.keys()];
		const stored = new Map<string, string>();
		for (let i = 0; i < keys.length; i += CHUNK) {
			const chunk = keys.slice(i, i + CHUNK);
			for (const r of this.all<{ key: string; facts: string }>(
				`SELECT key, facts FROM subjects WHERE key IN (${marks(chunk.length)})`,
				...chunk
			))
				stored.set(r.key, r.facts);
		}
		const changed = [...fresh].filter(([k, x]) => stored.get(k) !== JSON.stringify(x));
		const now = Date.now();
		this.transaction(() => {
			for (const [k, x] of changed)
				this.run(
					`INSERT INTO subjects (key, facts, changed_at) VALUES (?, ?, ?)
           ON CONFLICT (key) DO UPDATE SET facts = excluded.facts, changed_at = excluded.changed_at`,
					k,
					JSON.stringify(x),
					now
				);
		});
		if (opts.dash !== false)
			await this.patchDashCaches(
				who,
				changed.map(([, x]) => x)
			);
		if (opts.threads === false || !keys.length)
			return { changed: changed.length, resolved: [], wrote: 0 };

		const items: Apply[] = [];
		for (let i = 0; i < keys.length; i += CHUNK) {
			const chunk = keys.slice(i, i + CHUNK);
			for (const row of this.all<ThreadRow>(
				`SELECT * FROM threads WHERE category != 'muted' AND subject_key IN (${marks(chunk.length)})`,
				...chunk
			))
				items.push({
					row,
					fresh: fresh.get(row.subject_key!)!,
					before: parse(stored.get(row.subject_key!))
				});
		}
		const out = await this.applyFacts(who, items, opts);
		return { changed: changed.length, ...out };
	}

	/** Read these threads' PRs and issues again (the watcher, the refresh button). */
	protected async refresh(
		who: Who,
		rows: Pick<ThreadRow, 'id' | 'subject_key'>[],
		opts: { quiet?: boolean } = {}
	): Promise<Resolved[]> {
		const refs = rows.flatMap((r) => subjectRefOf(r) ?? []);
		if (!refs.length) return [];
		const fetched = await fetchSubjects(who.token, refs, who.me);
		return (await this.record(who, [...fetched.values()], opts)).resolved;
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
			this.broadcast({ type: 'dash', kind });
		}
	}

	/**
	 * Apply fresh facts to inbox threads: classify, then watchOutcome (resolve, reopen, wake).
	 * Writes only threads that changed, and pushes what now needs you.
	 */
	private async applyFacts(
		who: Who,
		items: Apply[],
		opts: { quiet?: boolean } = {}
	): Promise<{ resolved: Resolved[]; wrote: number }> {
		const { me, settings, inboxTeams: myTeams } = who;
		const writes: (() => void)[] = [];
		const messages: PushMessage[] = [];
		const resolved: Resolved[] = [];
		for (const { row: r, fresh, before } of items) {
			const e = enrichmentOf(fresh, me);
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
					enrichment: before ? enrichmentOf(before, me) : null,
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
				c.category === r.category &&
				c.kind === r.kind &&
				c.summary === r.summary &&
				c.why === r.why &&
				c.actionLabel === r.action_label &&
				c.actionUrl === r.action_url &&
				(c.rule ?? null) === r.rule &&
				out.triage === r.triage &&
				out.resolvedAt === r.resolved_at &&
				note === r.resolved_note &&
				!out.clearSnooze;
			if (same) continue;
			writes.push(() =>
				this.run(
					`UPDATE threads SET category = ?, kind = ?, summary = ?, why = ?, action_label = ?, action_url = ?,
             rule = ?, triage = ?, resolved_at = ?, resolved_note = ?,
             snoozed_until = CASE WHEN ? THEN NULL ELSE snoozed_until END,
             snooze_event = CASE WHEN ? THEN NULL ELSE snooze_event END
           WHERE id = ?`,
					c.category,
					c.kind,
					c.summary,
					c.why,
					c.actionLabel,
					c.actionUrl,
					c.rule ?? null,
					out.triage,
					out.resolvedAt,
					note,
					out.clearSnooze ? 1 : 0,
					out.clearSnooze ? 1 : 0,
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
		if (writes.length) {
			this.transaction(() => writes.forEach((w) => w()));
			await this.bumpVersion();
		}
		if (messages.length && !opts.quiet) await this.send(messages.slice(0, MAX_INDIVIDUAL_PUSHES));
		if (resolved.length && !opts.quiet) await this.notifyResolved(resolved);
		return { resolved, wrote: writes.length };
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
		const fetched = await fetchSubjects(who.token, [{ key, owner, repo: name, number }], who.me);
		const sub = fetched.get(key);
		if (!sub) return { resolved: [] };
		const out = await this.record(who, [sub]);
		return { resolved: out.resolved.map(({ title, note }) => ({ title, note })) };
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
		const out = await this.record(who, [sub]);
		return {
			changed: out.changed > 0 || out.wrote > 0,
			resolved: out.resolved.map(({ title, note }) => ({ title, note }))
		};
	}
}
