import { createQuery } from '@tanstack/svelte-query';
import { alertsQuery, dashQuery } from '$lib/queries';
import { alertsSeen } from '$lib/alerts.svelte';
import type { DashResponse } from '$lib/shared/types';
import type { Counts } from '$lib/tab-status';

/**
 * The counts for the tab title, icon dot, and app badge. Same queries as the header, so this adds
 * no requests. Call it while a component starts.
 */
export function createTabCounts(): { readonly current: Counts } {
	const alerts = createQuery(alertsQuery);
	const prs = createQuery(() => dashQuery('pr'));
	const issues = createQuery(() => dashQuery('issue'));
	const turns = (d: DashResponse | undefined, turn: 'you' | 'team') =>
		d?.items.filter((i) => i.turn === turn && !i.dismissed).length ?? 0;
	const unread = (d: DashResponse | undefined) =>
		d?.items.filter((i) => i.unread && !i.dismissed).length ?? 0;
	const counts = $derived<Counts>({
		alerts: alerts.data?.filter((a) => a.sentAt > alertsSeen.at).length ?? 0,
		unread: unread(prs.data) + unread(issues.data),
		prYou: turns(prs.data, 'you'),
		prTeam: turns(prs.data, 'team'),
		issueYou: turns(issues.data, 'you')
	});
	return {
		get current() {
			return counts;
		}
	};
}
