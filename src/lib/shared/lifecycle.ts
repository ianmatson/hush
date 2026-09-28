import { shouldPush } from './place';
import { snoozeEvent, snoozeOutcome } from './snooze';
import { enrichmentOf, type SubjectFacts } from './subject';
import type { ActionKind, ItemState, Lane, Placement, Settings } from './types';
import { resolvedNote } from './watch';

/**
 * What happens to an item when Hush places it again (a notification, a search hit, the watcher,
 * a settings change): the rules of its life, in one pure function the Worker applies.
 *
 * - Done lasts until the turn changes (its signature: the turn's reason and the newest activity).
 *   A change in Updates does not bring it back.
 * - "It is my turn" / "Not my turn" last until the item changes.
 * - A snooze "until something happens" ends when it happens.
 * - An item that leaves Your turn by itself says why ("You approved").
 * - An item that comes into Your turn is pushed once per signature.
 */
export interface ItemBefore {
	/** The lane you saw (with your override). */
	lane: Lane;
	state: ItemState;
	needs: ActionKind;
	doneSig: string | null;
	override: 'turn' | 'updates' | null;
	overrideSig: string | null;
	snoozedUntil: number | null;
	snoozeEvent: string | null;
	snoozedAt: number | null;
	finishedAt: number | null;
	finishedNote: string | null;
	pushedSig: string | null;
}

export interface ItemAfter {
	lane: Lane;
	state: ItemState;
	doneSig: string | null;
	override: 'turn' | 'updates' | null;
	snoozedUntil: number | null;
	snoozeEvent: string | null;
	snoozedAt: number | null;
	finishedAt: number | null;
	finishedNote: string | null;
	pushedSig: string | null;
	/** Push this: it came into Your turn. */
	push: boolean;
	/** A snooze ended because this happened ("CI passed"). */
	woke: string | null;
	/** It left Your turn by itself, and why. */
	finished: string | null;
}

export interface ItemContext {
	/** The signature now. */
	sig: string;
	now: number;
	me: string;
	/** The subject's facts now and before this read (for "You approved"-style notes). */
	subject: SubjectFacts | null;
	before: SubjectFacts | null;
	settings: Pick<Settings, 'push'>;
	/** No pushes (the first sync, a settings change). */
	quiet?: boolean;
	/** You caused this (a settings change): no "finished" notes. */
	userAction?: boolean;
	/** A new item may be pushed: it came with a fresh notification. */
	newAndPushable?: boolean;
}

export function nextItemState(prev: ItemBefore | null, p: Placement, ctx: ItemContext): ItemAfter {
	const { sig, now, me, subject } = ctx;
	const override = prev?.override && prev.overrideSig === sig ? prev.override : null;
	const lane: Lane = override ?? p.lane;
	let state: ItemState = prev?.state ?? 'active';
	let doneSig = prev?.doneSig ?? null;
	let snoozedUntil = prev?.snoozedUntil ?? null;
	let snoozeEv = prev?.snoozeEvent ?? null;
	let snoozedAt = prev?.snoozedAt ?? null;
	let woke: string | null = null;

	if (state === 'done' && sig !== doneSig && lane !== 'updates' && lane !== 'muted') {
		state = 'active';
		doneSig = null;
	}
	if (state === 'snoozed' && snoozeEv) {
		const ev = snoozeEvent(snoozeEv);
		const outcome =
			ev && subject ? snoozeOutcome(ev.id, enrichmentOf(subject, me), snoozedAt ?? 0, me) : null;
		if (outcome?.wake) {
			state = 'active';
			snoozedUntil = snoozeEv = snoozedAt = null;
			woke = outcome.reason;
		}
	}
	const cameIntoTurn = lane === 'turn' && prev?.lane !== 'turn';
	// A rule that snoozes: when the item comes into Your turn.
	if (cameIntoTurn && state === 'active' && p.snoozeHours) {
		state = 'snoozed';
		snoozedUntil = now + p.snoozeHours * 3_600_000;
		snoozedAt = now;
		snoozeEv = null;
	}

	let finishedAt = prev?.finishedAt ?? null;
	let finishedNote = prev?.finishedNote ?? null;
	let finished: string | null = null;
	if (lane === 'turn') finishedAt = finishedNote = null;
	else if (
		prev &&
		prev.lane === 'turn' &&
		prev.state === 'active' &&
		state === 'active' &&
		!ctx.userAction
	) {
		finished = subject
			? resolvedNote(
					prev.needs,
					ctx.before ? enrichmentOf(ctx.before, me) : null,
					enrichmentOf(subject, me),
					me
				)
			: 'No longer needs you';
		finishedAt = now;
		finishedNote = finished;
	}

	let pushedSig = prev?.pushedSig ?? null;
	const push =
		cameIntoTurn &&
		state === 'active' &&
		(prev ? true : !!ctx.newAndPushable) &&
		!ctx.quiet &&
		pushedSig !== sig &&
		shouldPush({ ...p, lane }, ctx.settings);
	if (push) pushedSig = sig;

	return {
		lane,
		state,
		doneSig,
		override,
		snoozedUntil,
		snoozeEvent: snoozeEv,
		snoozedAt,
		finishedAt,
		finishedNote,
		pushedSig,
		push,
		woke: ctx.quiet ? null : woke,
		finished
	};
}
