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

export type ThreadAction = 'done' | 'undone' | 'read' | 'snooze' | 'unsnooze' | 'mute' | 'unmute';

export const api = {
	me: () => request<MeDTO>('GET', '/api/me'),
	login: (token: string) => request<{ login: string }>('POST', '/api/auth/login', { token }),
	logout: () => request('POST', '/api/auth/logout'),
	deleteAccount: () => request('DELETE', '/api/account'),
	threads: (view: View) =>
		request<{ threads: ThreadDTO[]; counts: Counts }>('GET', `/api/threads?view=${view}`),
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
	hide: (id: string, updatedAt: string) =>
		request('POST', '/api/dashboard/hide', { id, updatedAt }),
	unhide: (id: string) => request('POST', '/api/dashboard/unhide', { id }),
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
