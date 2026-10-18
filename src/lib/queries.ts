import {
	QueryCache,
	QueryClient,
	infiniteQueryOptions,
	queryOptions,
	type QueryKey
} from '@tanstack/svelte-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { browser } from '$app/environment';
import { live } from '$lib/live-state.svelte';
import { DRAFTS_KEY } from '$lib/drafts';
import { pullFilePageCount } from '$lib/shared/diff';
import { api, ApiError } from '$lib/api';
import { withUnsavedSettings } from '$lib/unsaved-settings';
import type { DashKind, MeDTO, PeekDTO, Settings } from '$lib/shared/types';

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

const MEMORY_ONLY_KEYS = new Set([
	'peek',
	'slack-mentions',
	'pull-files',
	'pull-compare',
	'pull-viewed',
	'pull-commits',
	'commit-diff',
	'review-threads',
	'suggest',
	'search-count'
]);

const TYPED_QUERY_FRESH_MS = 5 * MIN;
const TYPED_QUERY_GC_MS = 5 * MIN;

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
			q.state.status === 'success' && !MEMORY_ONLY_KEYS.has(String(q.queryKey[0]))
	},
	// Change this when a cached shape changes, to drop old caches.
	buster: 'v5'
};

export const keys = {
	me: ['me'] as const,
	dashAll: ['dash'] as const,
	dash: (kind: DashKind) => ['dash', kind] as const,
	feeds: ['feeds'] as const,
	sessions: ['sessions'] as const,
	pushDevices: ['push-devices'] as const,
	slack: ['slack'] as const,
	slackMentions: (repo: string, number: number, kind: DashKind) =>
		['slack-mentions', repo, number, kind] as const,
	teams: ['teams'] as const,
	peek: (repo: string, number: number) => ['peek', repo, number] as const,
	pullFiles: (repo: string, number: number, head: string) =>
		['pull-files', repo, number, head] as const,
	pullCompare: (repo: string, number: number, base: string, head: string) =>
		['pull-compare', repo, number, base, head] as const,
	pullViewed: (repo: string, number: number) => ['pull-viewed', repo, number] as const,
	pullCommits: (repo: string, number: number, head: string) =>
		['pull-commits', repo, number, head] as const,
	commitDiff: (repo: string, sha: string) => ['commit-diff', repo, sha] as const,
	reviewThreads: (repo: string, number: number) => ['review-threads', repo, number] as const,
	projects: (repo: string, number: number) => ['projects', repo, number] as const,
	alerts: ['alerts'] as const,
	suggest: (repo: string, kind: 'user' | 'ref', query: string) =>
		['suggest', repo, kind, query] as const,
	searchCount: (q: string) => ['search-count', q] as const
};

export function refetchUnlessLive(...queryKeys: QueryKey[]): Promise<unknown> {
	if (live.connected) return Promise.resolve();
	return Promise.all(queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

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

async function fetchMe() {
	const me = await api.me();
	return { ...me, settings: withUnsavedSettings(me.settings) };
}

export const meQuery = () =>
	queryOptions({
		queryKey: keys.me,
		queryFn: fetchMe,
		staleTime: MIN,
		refetchInterval: afterNextPoll(5_000)
	});

/** The alert history (the bell), refreshed when the live socket says so (or after each poll). */
export const alertsQuery = () =>
	queryOptions({
		queryKey: keys.alerts,
		queryFn: api.alerts,
		refetchInterval: afterNextPoll(10_000)
	});

// The server caches dashboards for 15 minutes, so asking more often gains nothing.
export const dashQuery = (kind: DashKind) =>
	queryOptions({
		queryKey: keys.dash(kind),
		queryFn: () => api.dashboard(kind),
		staleTime: 15 * MIN,
		// A saved list with a refresh on its way: the live socket says when it is ready; without
		// the socket, ask again soon.
		refetchInterval: (q) => (q.state.data?.refreshing && !live.connected ? 10_000 : 15 * MIN)
	});

export const feedsQuery = () =>
	queryOptions({ queryKey: keys.feeds, queryFn: api.feeds, staleTime: 5 * MIN });
export const sessionsQuery = () => queryOptions({ queryKey: keys.sessions, queryFn: api.sessions });
export const pushDevicesQuery = () =>
	queryOptions({ queryKey: keys.pushDevices, queryFn: api.subscriptions });
export const slackQuery = () => queryOptions({ queryKey: keys.slack, queryFn: api.slack });
export const slackMentionsQuery = (repo: string, number: number, kind: DashKind) =>
	infiniteQueryOptions({
		queryKey: keys.slackMentions(repo, number, kind),
		queryFn: ({ pageParam }) => api.slackMentions(repo, number, kind, pageParam ?? undefined),
		initialPageParam: null as string | null,
		getNextPageParam: (page) => page.nextCursor,
		staleTime: 5 * MIN,
		gcTime: 5 * MIN,
		refetchOnWindowFocus: false,
		retry: false
	});
export const teamsQuery = () =>
	queryOptions({ queryKey: keys.teams, queryFn: () => api.teams(), staleTime: 60 * MIN });

export const suggestQuery = (repo: string, kind: 'user' | 'ref', query: string, from: string) =>
	queryOptions({
		queryKey: keys.suggest(repo, kind, query.toLowerCase()),
		queryFn: () => api.suggest(repo, kind, query, from).then((r) => r.items),
		staleTime: TYPED_QUERY_FRESH_MS,
		gcTime: TYPED_QUERY_GC_MS
	});

export const searchCountQuery = (q: string) =>
	queryOptions({
		queryKey: keys.searchCount(q),
		queryFn: () => api.countSearch(q),
		staleTime: TYPED_QUERY_FRESH_MS,
		gcTime: TYPED_QUERY_GC_MS,
		retry: false
	});

export const cachedSettings = (): Settings | undefined =>
	queryClient.getQueryData<MeDTO>(keys.me)?.settings;

export function updateCachedSettings(change: (settings: Settings) => Settings) {
	queryClient.setQueryData<MeDTO>(keys.me, (old) =>
		old ? { ...old, settings: change(old.settings) } : old
	);
}

/** Forget everything, e.g. on sign-out. */
export function clearCache() {
	queryClient.clear();
	if (!browser) return;
	localStorage.removeItem('hush:query-cache');
	localStorage.removeItem(DRAFTS_KEY);
}

let leaving = false;

/**
 * Clear the cache and do a full page load. Open components keep their last query results after
 * `clear()`, so a client-side navigation would still see the old account.
 */
export function leaveTo(path: '/login' | '/v') {
	if (!browser || leaving) return;
	if (path === '/login' && location.pathname === '/login') return;
	leaving = true;
	clearCache();
	location.replace(path);
}

export async function signOut() {
	await api.logout().catch(() => {});
	leaveTo('/login');
}

/** One PR or issue for the peek panel. Fetched when opened (about 1 GraphQL point), never polled. */
export const projectsQuery = (repo: string, number: number) =>
	queryOptions({
		queryKey: keys.projects(repo, number),
		queryFn: () => api.projects(repo, number),
		staleTime: 2 * MIN,
		gcTime: 10 * MIN,
		refetchOnWindowFocus: false
	});

export const pullFilesQuery = (repo: string, number: number, head: string, changedFiles: number) =>
	queryOptions({
		queryKey: keys.pullFiles(repo, number, head),
		queryFn: async () => {
			const pages = Array.from({ length: pullFilePageCount(changedFiles) }, (_, i) => i + 1);
			const results = await Promise.all(
				pages.map((page) => api.pullFilesPage(repo, number, head, page))
			);
			return results.flat();
		},
		staleTime: Infinity,
		gcTime: 10 * MIN,
		refetchOnWindowFocus: false
	});

export const pullCompareQuery = (repo: string, number: number, base: string, head: string) =>
	queryOptions({
		queryKey: keys.pullCompare(repo, number, base, head),
		queryFn: () => api.compareCommits(repo, number, base, head),
		staleTime: Infinity,
		gcTime: 10 * MIN,
		refetchOnWindowFocus: false
	});

export const pullCommitsQuery = (repo: string, number: number, head: string) =>
	queryOptions({
		queryKey: keys.pullCommits(repo, number, head),
		queryFn: () => api.pullCommits(repo, number),
		staleTime: Infinity,
		gcTime: 10 * MIN,
		refetchOnWindowFocus: false
	});

export const commitDiffQuery = (repo: string, number: number, sha: string) =>
	queryOptions({
		queryKey: keys.commitDiff(repo, sha),
		queryFn: () => api.commitDiff(repo, number, sha),
		staleTime: Infinity,
		gcTime: 10 * MIN,
		refetchOnWindowFocus: false
	});

export const reviewThreadsQuery = (repo: string, number: number) =>
	queryOptions({
		queryKey: keys.reviewThreads(repo, number),
		queryFn: () => api.reviewThreads(repo, number),
		staleTime: MIN,
		gcTime: 10 * MIN
	});

export const pullViewedQuery = (repo: string, number: number) =>
	queryOptions({
		queryKey: keys.pullViewed(repo, number),
		queryFn: () => api.viewedFiles(repo, number),
		staleTime: MIN,
		gcTime: 10 * MIN
	});

export const peekQuery = (repo: string, number: number) =>
	queryOptions({
		queryKey: keys.peek(repo, number),
		queryFn: () => api.peek(repo, number),
		staleTime: 2 * MIN,
		gcTime: 10 * MIN,
		refetchOnWindowFocus: false
	});
