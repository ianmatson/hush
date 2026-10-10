import { snoozeEvent, snoozeOutcome, SNOOZE_EVENT_MAX_MS, type SnoozeEvent } from './snooze';
import { enrichmentOf, type SubjectFacts } from './subject';
import type { Change } from './types';

export const MUTED_AT = '9999-12-31T23:59:59Z';

export interface SnoozeChoice {
	until?: number;
	event?: SnoozeEvent;
}

export interface ItemMark {
	updatedAt: string;
	snoozedUntil: number | null;
	snoozeEvent: SnoozeEvent | null;
	snoozedAt: number | null;
}

export type MarkState =
	{ kind: 'none' } | { kind: 'muted' } | { kind: 'snoozed'; snooze: SnoozeChoice };

const AWAKE: MarkState = { kind: 'none' };

export const eventSnoozeDeadline = (snoozedAt: number) => snoozedAt + SNOOZE_EVENT_MAX_MS;

export function markState(
	mark: ItemMark | undefined,
	updatedAt: string,
	facts: SubjectFacts | undefined,
	me: string,
	now: number
): MarkState {
	if (!mark) return AWAKE;
	if (mark.updatedAt === MUTED_AT) return { kind: 'muted' };
	if (mark.snoozeEvent) {
		const since = mark.snoozedAt ?? 0;
		const pastDeadline = now >= (mark.snoozedUntil ?? eventSnoozeDeadline(since));
		const happened =
			!!facts && snoozeOutcome(mark.snoozeEvent, enrichmentOf(facts, me), since, me).wake;
		return pastDeadline || happened
			? AWAKE
			: { kind: 'snoozed', snooze: { event: mark.snoozeEvent } };
	}
	if (mark.snoozedUntil !== null)
		return now < mark.snoozedUntil
			? { kind: 'snoozed', snooze: { until: mark.snoozedUntil } }
			: AWAKE;
	return Date.parse(updatedAt) <= Date.parse(mark.updatedAt)
		? { kind: 'snoozed', snooze: {} }
		: AWAKE;
}

const READ_WORTHY = (c: Change) => c.kind !== 'labels';

export const isUnread = (seenAt: number | null | undefined, changes: Change[] | undefined) =>
	seenAt == null || (changes ?? []).some(READ_WORTHY);

const lowerFirstWord = (label: string) =>
	/^[A-Z][a-z]/.test(label) ? label[0].toLowerCase() + label.slice(1) : label;

export function snoozeLabel(choice: SnoozeChoice): string {
	if (choice.event)
		return `Until ${lowerFirstWord(snoozeEvent(choice.event)?.label ?? 'something happens')}`;
	if (choice.until)
		return `Until ${new Date(choice.until).toLocaleString(undefined, {
			weekday: 'short',
			hour: 'numeric',
			minute: '2-digit'
		})}`;
	return 'Until new activity';
}
