import { createQuery } from '@tanstack/svelte-query';
import { alertsQuery, itemsQuery } from '$lib/queries';
import { alertsSeen } from '$lib/alerts.svelte';
import type { Counts } from '$lib/tab-status';

/**
 * The counts for the tab title, icon dot, and app badge. Same queries as the header, so this adds
 * no requests. Call it while a component starts.
 */
export function createTabCounts(): { readonly current: Counts } {
	const alerts = createQuery(alertsQuery);
	const turn = createQuery(() => itemsQuery('turn'));
	const counts = $derived<Counts>({
		alerts: alerts.data?.filter((a) => a.sentAt > alertsSeen.at).length ?? 0,
		turn: turn.data?.counts.turn ?? 0,
		waiting: turn.data?.counts.waiting ?? 0
	});
	return {
		get current() {
			return counts;
		}
	};
}
