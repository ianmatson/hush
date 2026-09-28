import { compileRules, place } from '../../src/lib/shared/place';
import { snapshotOf } from '../../src/lib/shared/changes';
import { nextItemState, type ItemBefore } from '../../src/lib/shared/lifecycle';
import { subjectKey, type SubjectFacts } from '../../src/lib/shared/subject';
import type { ActionKind, ItemState, Placement } from '../../src/lib/shared/types';
import { fetchSubjects } from '../github';
import type { PushMessage } from '../webpush';
import { PollerAlerts } from './alerts';
import { itemFactsOf, laneOf, sourcesOf, subjectRefOf, type ItemRow } from './schema';
import { MAX_INDIVIDUAL_PUSHES, type Resolved, type Who } from './shared';

/** SQLite binds at most this many values per statement here; longer IN lists go in chunks. */
const CHUNK = 90;
const marks = (n: number) => Array(n).fill('?').join(',');
const parse = (json: string | undefined) => (json ? (JSON.parse(json) as SubjectFacts) : null);

/** Something a source knows about an item: a notification, a search hit, a fresh read. */
export interface ItemInput {
	key: string;
	repo: string;
	number: number | null;
	subjectType: string;
	/** For items with no subject facts (releases, workflow runs). */
	title: string;
	url: string;
	/** A notification's reason (review_requested…). */
	event?: string;
	/** A notification: its time, whether it is unread, and whether it arrived after the first sync. */
	notification?: { updatedAt: string; unread: boolean; fresh: boolean };
	/** "notification", "search:<id>", or "follow". */
	source?: string;
	/** Make the item if Hush does not have it (the watcher and the peek only update). */
	create: boolean;
}

/** The newest of some ISO times. */
const newest = (...xs: (string | null | undefined)[]) =>
	xs
		.filter((x): x is string => !!x)
		.sort()
		.at(-1) ?? new Date(0).toISOString();

/**
 * Items and the subject store. Every source goes through `upsertItems`: it places each item
 * (shared/place.ts), then applies what follows from the move: a Done item comes back when its
 * turn changes, a snooze "until something happens" ends, an item that left Your turn by itself
 * says why ("You approved"), and an item that came into Your turn is pushed.
 */
export abstract class PollerItems extends PollerAlerts {
	/**
	 * Store fresh facts from GitHub, then update the items about them. Returns the facts stored
	 * before, for the notes about what changed.
	 */
	protected storeSubjects(subjects: SubjectFacts[]): {
		before: Map<string, SubjectFacts>;
		changed: number;
	} {
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
		const before = new Map<string, SubjectFacts>();
		for (const [k, v] of stored) before.set(k, parse(v)!);
		return { before, changed: changed.length };
	}

	/** Store fresh facts and update the items that Hush has for them (the watcher, a quick check). */
	protected async record(
		who: Who,
		subjects: SubjectFacts[],
		opts: { quiet?: boolean } = {}
	): Promise<{ changed: number; resolved: Resolved[]; wrote: number }> {
		const { before, changed } = this.storeSubjects(subjects);
		const out = await this.upsertItems(
			who,
			subjects.map((x) => ({
				key: subjectKey(x.repo, x.number),
				repo: x.repo,
				number: x.number,
				subjectType: x.kind === 'pr' ? 'PullRequest' : 'Issue',
				title: x.title,
				url: x.url,
				create: false
			})),
			{ ...opts, before }
		);
		return { changed, ...out };
	}

	/**
	 * Place items again and write what changed. `before` has the subject facts before this read
	 * (for "You approved"-style notes); `quiet` sends no pushes (the first sync, a settings change).
	 */
	protected async upsertItems(
		who: Who,
		inputs: ItemInput[],
		opts: { quiet?: boolean; before?: Map<string, SubjectFacts>; userAction?: boolean } = {}
	): Promise<{ resolved: Resolved[]; wrote: number }> {
		if (!inputs.length) return { resolved: [], wrote: 0 };
		const { me, settings, myTeams } = who;
		const rules = compileRules(settings.rules);
		const keys = [...new Set(inputs.map((i) => i.key))];
		const rows = new Map<string, ItemRow>();
		const facts = new Map<string, SubjectFacts>();
		for (let i = 0; i < keys.length; i += CHUNK) {
			const chunk = keys.slice(i, i + CHUNK);
			for (const r of this.all<ItemRow>(
				`SELECT * FROM items WHERE key IN (${marks(chunk.length)})`,
				...chunk
			))
				rows.set(r.key, r);
			for (const r of this.all<{ key: string; facts: string }>(
				`SELECT key, facts FROM subjects WHERE key IN (${marks(chunk.length)})`,
				...chunk
			))
				facts.set(r.key, parse(r.facts)!);
		}

		const now = Date.now();
		const writes: (() => void)[] = [];
		const toPush: { key: string; p: Placement; title: string; repo: string }[] = [];
		const woken: PushMessage[] = [];
		const resolved: Resolved[] = [];
		// Inputs for one key in one call (a notification and a search hit): merge them.
		const merged = new Map<string, ItemInput>();
		for (const i of inputs) {
			const m = merged.get(i.key);
			merged.set(i.key, m ? { ...m, ...i, create: m.create || i.create } : i);
		}

		for (const input of merged.values()) {
			const row = rows.get(input.key) ?? null;
			if (!row && !input.create) continue;
			const subject = facts.get(input.key) ?? null;
			const event = input.event ?? row?.event ?? null;
			const base = {
				repo: input.repo,
				subject_type: input.subjectType,
				title: input.title,
				url: input.url,
				event
			};
			const p = place(itemFactsOf(base, subject, me, myTeams), settings, rules);
			const activityAt = newest(
				subject?.updatedAt,
				input.notification?.updatedAt,
				row?.activity_at
			);
			const sig = `${p.reason}|${subject?.updatedAt ?? input.notification?.updatedAt ?? row?.activity_at ?? ''}`;

			const prev: ItemBefore | null = row
				? {
						lane: laneOf(row),
						state: row.state as ItemState,
						needs: row.needs as ActionKind,
						doneSig: row.done_sig,
						override: row.override as ItemBefore['override'],
						overrideSig: row.override_sig,
						snoozedUntil: row.snoozed_until,
						snoozeEvent: row.snooze_event,
						snoozedAt: row.snoozed_at,
						finishedAt: row.finished_at,
						finishedNote: row.finished_note,
						pushedSig: row.pushed_sig
					}
				: null;
			const n = nextItemState(prev, p, {
				sig,
				now,
				me,
				subject,
				before: opts.before?.get(input.key) ?? null,
				settings,
				quiet: opts.quiet,
				userAction: opts.userAction,
				newAndPushable: !!input.notification?.fresh
			});
			const title = subject?.title ?? input.title;
			if (n.woke && settings.push)
				woken.push({
					title: `Snooze over: ${n.woke}`,
					body: `${title}\n${input.repo}`,
					url: p.actionUrl,
					tag: input.key
				});
			if (n.finished) resolved.push({ id: input.key, title, note: n.finished });
			if (n.push) toPush.push({ key: input.key, p, title, repo: input.repo });

			const sources = new Set(row ? sourcesOf(row) : []);
			if (input.source) sources.add(input.source);
			// Read on GitHub before Hush first saw it: that is where "since you last looked" starts.
			const seenAt =
				row?.seen_at ?? (!row && input.notification && !input.notification.unread ? now : null);
			const seenSnapshot =
				row?.seen_snapshot ?? (seenAt && subject ? JSON.stringify(snapshotOf(subject, me)) : null);

			const next: ItemRow = {
				key: input.key,
				repo: input.repo,
				number: input.number,
				subject_type: input.subjectType,
				title: subject?.title ?? input.title,
				url: subject?.url ?? input.url,
				event,
				lane: p.lane,
				section: p.section,
				needs: p.needs,
				summary: p.summary,
				reason: p.reason,
				why: p.event,
				action_label: p.actionLabel,
				action_url: p.actionUrl,
				waiting_on: p.waitingOn,
				waiting_since: p.waitingSince,
				priority: p.priority,
				rule: p.rule ?? null,
				sig,
				state: n.state,
				done_sig: n.doneSig,
				override: n.override,
				override_sig: n.override ? sig : null,
				snoozed_until: n.snoozedUntil,
				snooze_event: n.snoozeEvent,
				snoozed_at: n.snoozedAt,
				finished_at: n.finishedAt,
				finished_note: n.finishedNote,
				seen_at: seenAt,
				seen_snapshot: seenSnapshot,
				pushed_sig: n.pushedSig,
				pushed_at: row?.pushed_at ?? null,
				sources: JSON.stringify([...sources].sort()),
				activity_at: activityAt,
				first_seen_at: row?.first_seen_at ?? now
			};
			if (row && (Object.keys(next) as (keyof ItemRow)[]).every((k) => next[k] === row[k]))
				continue;
			writes.push(() => this.writeItem(next));
		}

		if (writes.length) {
			this.transaction(() => writes.forEach((w) => w()));
			await this.bumpVersion();
		}
		if (toPush.length) await this.pushItems(toPush);
		if (woken.length) await this.send(woken);
		if (resolved.length && !opts.quiet) await this.notifyResolved(resolved);
		return { resolved, wrote: writes.length };
	}

	private writeItem(r: ItemRow) {
		const cols = Object.keys(r) as (keyof ItemRow)[];
		this.run(
			`INSERT INTO items (${cols.join(', ')}) VALUES (${marks(cols.length)})
       ON CONFLICT (key) DO UPDATE SET ${cols
					.filter((c) => c !== 'key')
					.map((c) => `${c} = excluded.${c}`)
					.join(', ')}`,
			...cols.map((c) => r[c])
		);
	}

	/** Push items that came into Your turn: one push each, or one for all when there are many. */
	private async pushItems(items: { key: string; p: Placement; title: string; repo: string }[]) {
		const origin = (await this.ctx.storage.get<string>('origin')) ?? '';
		const one = (i: (typeof items)[number]): PushMessage => ({
			title: i.p.summary,
			body: `${i.title}\n${i.repo}`,
			url: i.p.actionUrl,
			tag: i.key
		});
		const messages: PushMessage[] =
			items.length <= MAX_INDIVIDUAL_PUSHES
				? items.map(one)
				: [
						{
							title: `${items.length} things are your turn`,
							body: items
								.slice(0, 4)
								.map((i) => i.p.summary)
								.join('\n'),
							url: `${origin}/turn`,
							tag: 'digest'
						}
					];
		// The history lists each alert, also the ones this push put together in one.
		await this.send(messages, items.map(one));
	}

	/** Read these items' PRs and issues again (the watcher, the refresh button). */
	protected async refresh(
		who: Who,
		keys: string[],
		opts: { quiet?: boolean } = {}
	): Promise<Resolved[]> {
		const refs = keys.flatMap((k) => subjectRefOf(k) ?? []);
		if (!refs.length) return [];
		const fetched = await fetchSubjects(who.token, refs, who.me);
		return (await this.record(who, [...fetched.values()], opts)).resolved;
	}

	/**
	 * Check one PR or issue now: you just came back to Hush from it on GitHub. Stores its facts,
	 * which updates its item. About 1 point.
	 */
	async recheck(
		repo: string,
		number: number
	): Promise<{ resolved: { title: string; note: string }[] }> {
		const who = await this.who();
		if (!who) return { resolved: [] };
		const key = subjectKey(repo, number);
		const resolved = await this.refresh(who, [key]);
		return { resolved: resolved.map(({ title, note }) => ({ title, note })) };
	}

	/** Facts that the API fetched (the peek): store them and update the item. */
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
