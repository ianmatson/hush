/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

const sw = self as unknown as ServiceWorkerGlobalScope;

interface PushPayload {
	title: string;
	body: string;
	url: string;
	tag?: string;
	threadIds?: string[];
}

type TriageAction = 'done' | 'snooze';
const SNOOZE_FROM_NOTIFICATION_MS = 3 * 3600_000;
const TRIAGE_BUTTONS: { action: TriageAction; title: string }[] = [
	{ action: 'done', title: 'Done' },
	{ action: 'snooze', title: 'Snooze 3h' }
];

const isTriageAction = (action: string): action is TriageAction =>
	TRIAGE_BUTTONS.some((b) => b.action === action);

async function triageFromNotification(action: TriageAction, threadIds: string[]): Promise<boolean> {
	const body = action === 'snooze' ? { until: Date.now() + SNOOZE_FROM_NOTIFICATION_MS } : {};
	const res = await fetch(`/api/threads/bulk/${action}?ids=${threadIds.join(',')}`, {
		method: 'POST',
		credentials: 'same-origin',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	}).catch(() => null);
	return !!res?.ok;
}

async function openOrFocus(url: string) {
	const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
	const same = windows.find((w) => w.url === url);
	if (same) return same.focus();
	return sw.clients.openWindow(url);
}

sw.addEventListener('install', () => sw.skipWaiting());
sw.addEventListener('activate', (event) => event.waitUntil(sw.clients.claim()));

sw.addEventListener('push', (event) => {
	let data: PushPayload = { title: 'Hush', body: 'Something needs you.', url: '/inbox' };
	try {
		if (event.data) data = event.data.json() as PushPayload;
	} catch {
		// Keep the default text.
	}
	const threadIds = data.threadIds ?? [];
	const options: NotificationOptions & {
		actions?: { action: string; title: string }[];
		renotify?: boolean;
	} = {
		body: data.body,
		tag: data.tag,
		renotify: !!data.tag,
		data: { url: data.url, threadIds },
		icon: '/icon-192.png',
		badge: '/badge-72.png',
		...(threadIds.length ? { actions: TRIAGE_BUTTONS } : {})
	};
	event.waitUntil(sw.registration.showNotification(data.title, options));
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url: string = event.notification.data?.url ?? '/inbox';
	const threadIds: string[] = event.notification.data?.threadIds ?? [];
	const action = event.action;
	if (isTriageAction(action) && threadIds.length) {
		event.waitUntil(
			triageFromNotification(action, threadIds).then((ok) => (ok ? undefined : openOrFocus(url)))
		);
		return;
	}
	event.waitUntil(openOrFocus(url));
});
