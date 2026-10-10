/**
 * Swipe actions on phones and tablets (touch only: a mouse drags, it never swipes): one action
 * for a swipe to the right and one for a swipe to the left.
 */
export type SwipeKind = 'dash';
export interface SwipePair {
	left: string;
	right: string;
}
export type SwipeSettings = Record<SwipeKind, SwipePair>;

export const SWIPE_ACTIONS: Record<SwipeKind, { id: string; label: string }[]> = {
	dash: [
		{ id: 'none', label: 'Nothing' },
		{ id: 'snooze', label: 'Snooze until new activity' },
		{ id: 'mute', label: 'Mute' },
		{ id: 'read', label: 'Read / unread' }
	]
};

export const DEFAULT_SWIPE: SwipeSettings = {
	dash: { right: 'snooze', left: 'mute' }
};

export function knownSwipe(
	saved: Partial<Record<SwipeKind, Partial<SwipePair>>> | undefined
): SwipeSettings {
	const pairOf = (kind: SwipeKind): SwipePair => {
		const savedPair = saved?.[kind] ?? {};
		const choose = (side: keyof SwipePair) => {
			const id = savedPair[side];
			return SWIPE_ACTIONS[kind].some((a) => a.id === id) ? id! : DEFAULT_SWIPE[kind][side];
		};
		return { ...DEFAULT_SWIPE[kind], left: choose('left'), right: choose('right') };
	};
	return { dash: pairOf('dash') };
}

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
