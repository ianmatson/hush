import { QueryCache, QueryClient, queryOptions } from '@tanstack/svelte-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { browser } from '$app/environment';
import { api, ApiError, type ThreadsResponse } from '$lib/api';
import type {
	Counts,
	DashKind,
	DashResponse,
	MeDTO,
	Settings,
	ThreadDTO,
	View
} from '$lib/shared/types';

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
	// Change this when a cached shape changes, to drop old caches.
	buster: 'v2'
};

export const keys = {
	me: ['me'] as const,
	threadsAll: ['threads'] as const,
	threads: (view: View) => ['threads', view] as const,
	dashAll: ['dash'] as const,
	dash: (kind: DashKind) => ['dash', kind] as const,
	feeds: ['feeds'] as const,
	pushDevices: ['push-devices'] as const,
	teams: ['teams'] as const
};

export const meQuery = () => queryOptions({ queryKey: keys.me, queryFn: api.me, staleTime: MIN });

export const threadsQuery = (view: View) =>
	queryOptions({
		queryKey: keys.threads(view),
		queryFn: async () => {
			const cached = queryClient.getQueryData<ThreadsResponse>(keys.threads(view));
			const res = await api.threads(view, cached?.etag);
			// 304 (only possible when we sent a cached etag): the server read no threads,
			// and our copy is still correct.
			if (!res) return cached!;
			reconcileViews(view, res.counts);
			return res;
		},
		refetchInterval: MIN
	});

/** The API returns at most this many threads per view. */
const LIST_LIMIT = 300;

/**
 * Every threads response carries fresh counts for all views. Use them to find other cached lists
 * that are out of date (e.g. the poller added items after that list was fetched) and refetch only
 * those. Also copy the counts into every cached view, so all tabs agree.
 */
export function reconcileViews(fetched: View, counts: Counts) {
	// Copy counts first: writing data into a query clears its "invalidated" flag.
	setCounts(counts);
	for (const v of ['action', 'fyi', 'snoozed'] as const) {
		if (v === fetched) continue;
		const cached = queryClient.getQueryData<{ threads: ThreadDTO[] }>(keys.threads(v));
		if (cached && cached.threads.length !== Math.min(counts[v], LIST_LIMIT))
			queryClient.invalidateQueries({ queryKey: keys.threads(v), exact: true });
	}
}

// The server caches dashboards for 5 minutes, so asking more often gains nothing.
export const dashQuery = (kind: DashKind) =>
	queryOptions({
		queryKey: keys.dash(kind),
		queryFn: () => api.dashboard(kind),
		staleTime: 5 * MIN,
		refetchInterval: 5 * MIN
	});

export const feedsQuery = () =>
	queryOptions({ queryKey: keys.feeds, queryFn: api.feeds, staleTime: 5 * MIN });
export const pushDevicesQuery = () =>
	queryOptions({ queryKey: keys.pushDevices, queryFn: api.subscriptions });
export const teamsQuery = () =>
	queryOptions({ queryKey: keys.teams, queryFn: () => api.teams(), staleTime: 60 * MIN });

/** Your-turn count for a dashboard. */
export const turnCount = (d: DashResponse | undefined) =>
	d ? d.items.filter((i) => i.turn === 'you' && !i.dismissed).length : null;

/** Every threads response carries the counts; keep them in sync across views. */
export function setCounts(counts: Counts) {
	queryClient.setQueriesData<{ threads: ThreadDTO[]; counts: Counts }>(
		{ queryKey: keys.threadsAll },
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
export function leaveTo(path: '/login' | '/') {
	if (!browser || leaving) return;
	if (path === '/login' && location.pathname === '/login') return;
	leaving = true;
	clearCache();
	location.replace(path);
}
