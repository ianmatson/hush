import { snoozeEvent, type SnoozeEvent } from './snooze';

import type { Change } from './types';

export interface SnoozeChoice {
	until?: number;
	event?: SnoozeEvent;
}

const NOT_READ_WORTHY = new Set<Change['kind']>(['labels', 'ci']);
const READ_WORTHY = (c: Change) => !NOT_READ_WORTHY.has(c.kind);

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
