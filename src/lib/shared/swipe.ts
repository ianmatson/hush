/**
 * Swipe actions on phones and tablets (touch only: a mouse drags, it never swipes). Each list
 * has one action for a swipe to the right and one for a swipe to the left.
 */
export type SwipeKind = 'inbox' | 'dash';
export interface SwipePair {
	left: string;
	right: string;
}
export type SwipeSettings = Record<SwipeKind, SwipePair>;

export const SWIPE_ACTIONS: Record<SwipeKind, { id: string; label: string }[]> = {
	inbox: [
		{ id: 'none', label: 'Nothing' },
		{ id: 'done', label: 'Done' },
		{ id: 'snooze', label: 'Snooze…' },
		{ id: 'mute', label: 'Mute' },
		{ id: 'read', label: 'Read / unread' },
		{ id: 'not-needed', label: 'Doesn’t need me…' }
	],
	dash: [
		{ id: 'none', label: 'Nothing' },
		{ id: 'hide', label: 'Hide until it changes' },
		{ id: 'mute', label: 'Mute' },
		{ id: 'not-needed', label: 'Not my turn…' }
	]
};

export const DEFAULT_SWIPE: SwipeSettings = {
	inbox: { right: 'done', left: 'snooze' },
	dash: { right: 'hide', left: 'mute' }
};

export function validateSwipe(v: unknown): string | null {
	if (typeof v !== 'object' || v === null) return '"swipe" must be an object.';
	for (const [kind, pair] of Object.entries(v)) {
		const actions = SWIPE_ACTIONS[kind as SwipeKind];
		if (!actions) return `Unknown setting "swipe.${kind}".`;
		if (typeof pair !== 'object' || pair === null)
			return `"swipe.${kind}" must be { "left": …, "right": … }.`;
		for (const [side, id] of Object.entries(pair)) {
			if (side !== 'left' && side !== 'right')
				return `"swipe.${kind}" has only "left" and "right".`;
			if (!actions.some((a) => a.id === id))
				return `"swipe.${kind}.${side}" must be one of ${actions.map((a) => `"${a.id}"`).join(', ')}.`;
		}
	}
	return null;
}
