import { QueryCache, QueryClient, queryOptions } from '@tanstack/svelte-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { browser } from '$app/environment';
import { live } from '$lib/live-state.svelte';
import { api, ApiError, type ItemsResponse, type ListView } from '$lib/api';
import type { Counts, ItemDTO, MeDTO, Settings } from '$lib/shared/types';

const MIN = 60_000;

export const queryClient = new QueryClient({
	// Any "not signed in" answer ends the session in this tab, once.
	queryCache: new QueryCache({
		onError: (err) => {
			if (err instanceof ApiError && err.status === 401) leaveTo('/login');
		}
	}),
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			// Keep data long enough for the persisted cache to be useful after a reload.
			gcTime: 24 * 60 * MIN,
			refetchOnWindowFocus: true,
			// Do not retry client errors (401, 400…).
			retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2
		}
	}
});

/** Cache in localStorage so a reload shows the last data at once, then revalidates. */
export const persistOptions = {
	persister: createSyncStoragePersister({
		storage: browser ? window.localStorage : undefined,
		key: 'hush:query-cache',
		throttleTime: 1000
	}),
	maxAge: 24 * 60 * MIN,
	// Peeks are large and cheap to fetch again: keep them in memory only.
	dehydrateOptions: {
		shouldDehydrateQuery: (q: { state: { status: string }; queryKey: readonly unknown[] }) =>
			q.state.status === 'success' && q.queryKey[0] !== 'peek'
	},
	// Change this when a cached shape changes, to drop old caches.
	buster: 'v3'
};

export const keys = {
	me: ['me'] as const,
	itemsAll: ['items'] as const,
	items: (view: ListView) => ['items', view] as const,
	item: (key: string) => ['item', key] as const,
	feeds: ['feeds'] as const,
	sessions: ['sessions'] as const,
	pushDevices: ['push-devices'] as const,
	teams: ['teams'] as const,
	peek: (repo: string, number: number) => ['peek', repo, number] as const,
	alerts: ['alerts'] as const
};

/**
 * Without the live socket: the server gets new data only when it polls GitHub (every 5 or 15
 * minutes), so refresh just after each poll; focus still refreshes at once. Falls back to every
 * minute while the next poll time is unknown or past (a poll can run late).
 */
const afterNextPoll = (extra: number) => (): number | false => {
	// The live socket says what changed; the timer is only for when it is down.
	if (live.connected) return false;
	const next = queryClient.getQueryData<MeDTO>(keys.me)?.nextPollAt;
	const wait = next ? next - Date.now() + extra : 0;
	return wait > 5_000 ? Math.min(wait, 16 * MIN) : MIN;
};

export const meQuery = () =>
	queryOptions({
		queryKey: keys.me,
		queryFn: api.me,
		staleTime: MIN,
		// During the first sync, ask often: its end must not wait for a socket message that a tab
		// can miss (it connected after the message).
		refetchInterval: (q) => (q.state.data?.firstSync ? 3_000 : afterNextPoll(5_000)())
	});

/** The alert history (the bell), refreshed when the live socket says so (or after each poll). */
export const alertsQuery = () =>
	queryOptions({
		queryKey: keys.alerts,
		queryFn: api.alerts,
		refetchInterval: afterNextPoll(10_000)
	});

export const itemsQuery = (view: ListView) =>
	queryOptions({
		queryKey: keys.items(view),
		queryFn: async () => {
			const cached = queryClient.getQueryData<ItemsResponse>(keys.items(view));
			const res = await api.items(view, cached?.etag);
			// 304 (only possible when we sent a cached etag): the server read no items, and our
			// copy is still correct.
			if (!res) return cached!;
			setCounts(res.counts);
			return res;
		},
		refetchInterval: afterNextPoll(10_000)
	});

export const feedsQuery = () =>
	queryOptions({ queryKey: keys.feeds, queryFn: api.feeds, staleTime: 5 * MIN });
export const sessionsQuery = () => queryOptions({ queryKey: keys.sessions, queryFn: api.sessions });
export const pushDevicesQuery = () =>
	queryOptions({ queryKey: keys.pushDevices, queryFn: api.subscriptions });
export const teamsQuery = () =>
	queryOptions({ queryKey: keys.teams, queryFn: () => api.teams(), staleTime: 60 * MIN });

/** Every items response carries the counts; keep them in sync across lists. */
export function setCounts(counts: Counts) {
	queryClient.setQueriesData<{ items: ItemDTO[]; counts: Counts }>(
		{ queryKey: keys.itemsAll },
		(old) => (old ? { ...old, counts } : old)
	);
}

export function setSettings(settings: Settings) {
	queryClient.setQueryData<MeDTO>(keys.me, (old) => (old ? { ...old, settings } : old));
}

/** Forget everything, e.g. on sign-out. */
export function clearCache() {
	queryClient.clear();
	if (browser) localStorage.removeItem('hush:query-cache');
}

let leaving = false;

/**
 * Clear the cache and do a full page load. Open components keep their last query results after
 * `clear()`, so a client-side navigation would still see the old account.
 */
export function leaveTo(path: '/login' | '/turn') {
	if (!browser || leaving) return;
	if (path === '/login' && location.pathname === '/login') return;
	leaving = true;
	clearCache();
	location.replace(path);
}

/** One PR or issue for the peek panel. Fetched when opened (about 1 GraphQL point), never polled. */
export const peekQuery = (repo: string, number: number) =>
	queryOptions({
		queryKey: keys.peek(repo, number),
		queryFn: () => api.peek(repo, number),
		staleTime: 2 * MIN,
		gcTime: 10 * MIN,
		refetchOnWindowFocus: false
	});
