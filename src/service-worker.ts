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
	let data: PushPayload = { title: 'Hush', body: 'Something new in your views.', url: '/v' };
	try {
		if (event.data) data = event.data.json() as PushPayload;
	} catch {
		// Keep the default text.
	}
	const options: NotificationOptions & { renotify?: boolean } = {
		body: data.body,
		tag: data.tag,
		renotify: !!data.tag,
		data: { url: data.url },
		icon: '/icon-192.png',
		badge: '/badge-72.png'
	};
	event.waitUntil(sw.registration.showNotification(data.title, options));
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url: string = event.notification.data?.url ?? '/v';
	event.waitUntil(openOrFocus(url));
});
