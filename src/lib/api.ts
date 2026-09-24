import type {
	Counts,
	DashKind,
	DashResponse,
	FeedDTO,
	FeedFilter,
	MeDTO,
	Settings,
	TeamDTO,
	ThreadDTO,
	Turn,
	View
} from '$lib/shared/types';

export class ApiError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
	const res = await fetch(path, {
		method,
		headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
		credentials: 'same-origin'
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok)
		throw new ApiError(
			res.status,
			(data as { error?: string }).error ?? `Request failed (${res.status})`
		);
	return data as T;
}

export interface ThreadsResponse {
	threads: ThreadDTO[];
	counts: Counts;
	/** Send back as If-None-Match; the server answers 304 while nothing changes. */
	etag?: string;
}

export type ThreadAction =
	'done' | 'undone' | 'read' | 'unread' | 'snooze' | 'unsnooze' | 'mute' | 'unmute';

export const api = {
	me: () => request<MeDTO>('GET', '/api/me'),
	login: (token: string) => request<{ login: string }>('POST', '/api/auth/login', { token }),
	logout: () => request('POST', '/api/auth/logout'),
	deleteAccount: () => request('DELETE', '/api/account'),
	/** Returns null when the server says nothing changed since `etag` (304). */
	threads: async (view: View, etag?: string): Promise<ThreadsResponse | null> => {
		const res = await fetch(`/api/threads?view=${view}`, {
			headers: etag ? { 'If-None-Match': etag } : {},
			credentials: 'same-origin'
		});
		if (res.status === 304) return null;
		const data = await res.json().catch(() => ({}));
		if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
		return { ...data, etag: res.headers.get('ETag') ?? undefined };
	},
	actMany: (ids: string[], action: ThreadAction, body?: unknown) =>
		request<{ counts: Counts; updated: number }>(
			'POST',
			`/api/threads/bulk/${action}?ids=${ids.map(encodeURIComponent).join(',')}`,
			body ?? {}
		),
	act: (id: string, action: ThreadAction, body?: unknown) =>
		request<{ counts: Counts }>(
			'POST',
			`/api/threads/${encodeURIComponent(id)}/${action}`,
			body ?? {}
		),
	sync: () => request<{ lastPollAt: number | null; lastError: string | null }>('POST', '/api/sync'),
	saveSettings: (s: Partial<Settings>) =>
		request<{ settings: Settings; reclassified: number }>('PUT', '/api/settings', s),
	vapidKey: () => request<{ publicKey: string | null }>('GET', '/api/push/vapid-key'),
	subscriptions: () =>
		request<{ id: string; endpoint: string; label: string | null; createdAt: number }[]>(
			'GET',
			'/api/push/subscriptions'
		),
	subscribe: (sub: PushSubscriptionJSON, label: string) =>
		request('POST', '/api/push/subscribe', { ...sub, label }),
	unsubscribe: (endpoint: string) => request('POST', '/api/push/unsubscribe', { endpoint }),
	testPush: () => request<{ sent: number }>('POST', '/api/push/test'),
	dashboard: (kind: DashKind, refresh = false) =>
		request<DashResponse>('GET', `/api/dashboard/${kind}${refresh ? '?refresh=1' : ''}`),
	hide: (items: { id: string; updatedAt: string }[]) =>
		request('POST', '/api/dashboard/hide', { items }),
	unhide: (ids: string[]) => request('POST', '/api/dashboard/unhide', { ids }),
	arrange: (items: { id: string; updatedAt: string; turn?: Turn | null }[], order: string[]) =>
		request('POST', '/api/dashboard/arrange', { items, order }),
	teams: (refresh = false) =>
		request<{ teams: TeamDTO[]; error?: string }>(
			'GET',
			`/api/teams${refresh ? '?refresh=1' : ''}`
		),
	feeds: () => request<FeedDTO[]>('GET', '/api/feeds'),
	createFeed: (name: string, filter: FeedFilter) =>
		request<FeedDTO>('POST', '/api/feeds', { name, filter }),
	deleteFeed: (id: string) => request('DELETE', `/api/feeds/${id}`)
};
