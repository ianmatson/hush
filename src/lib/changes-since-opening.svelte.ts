import { withChangesSinceOpening } from './shared/changes';
import type { Change, DashItem } from './shared/types';

type OpenedItem = Pick<DashItem, 'id' | 'changes' | 'seenAt'>;

export interface ShownChanges {
	changes: Change[];
	seenAt: number | null;
}

export function changesSinceOpening(openItem: () => OpenedItem | null | undefined) {
	let atOpening = $state<{ id: string; changes: Change[]; seenAt: number | null } | null>(null);

	$effect.pre(() => {
		const item = openItem();
		if (!item) {
			atOpening = null;
			return;
		}
		if (atOpening?.id === item.id) return;
		atOpening = { id: item.id, changes: item.changes ?? [], seenAt: item.seenAt ?? null };
	});

	const shown = $derived.by((): ShownChanges => {
		const item = openItem();
		const now = item?.changes ?? [];
		if (!item || atOpening?.id !== item.id) return { changes: now, seenAt: item?.seenAt ?? null };
		return {
			changes: withChangesSinceOpening(atOpening.changes, now),
			seenAt: atOpening.seenAt
		};
	});

	return {
		get current() {
			return shown;
		}
	};
}
