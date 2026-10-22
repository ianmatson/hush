import { createQuery } from '@tanstack/svelte-query';
import { alertsQuery, itemsQuery, rowsOfKind } from '$lib/queries';
import { alertsSeen } from '$lib/alerts.svelte';
import type { DashItem } from '$lib/shared/types';
import { countsAsUnread, newAlertCount, type Counts } from '$lib/tab-status';

/**
 * The counts for the tab title, icon dot, and app badge. Same queries as the header, so this adds
 * no requests. Call it while a component starts.
 */
export function createTabCounts(): { readonly current: Counts } {
	const alerts = createQuery(alertsQuery);
	const items = createQuery(itemsQuery);
	const prs = $derived(rowsOfKind(items.data, 'pr'));
	const issues = $derived(rowsOfKind(items.data, 'issue'));
	const turns = (rows: DashItem[], turn: 'you' | 'team') =>
		rows.filter((i) => i.turn === turn && !i.dismissed).length;
	const counts = $derived<Counts>({
		alerts: newAlertCount(alerts.data, alertsSeen.at),
		unread: (items.data?.rows ?? []).filter(countsAsUnread).length,
		prYou: turns(prs, 'you'),
		prTeam: turns(prs, 'team'),
		issueYou: turns(issues, 'you')
	});
	return {
		get current() {
			return counts;
		}
	};
}
