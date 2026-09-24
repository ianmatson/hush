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

sw.addEventListener('install', () => sw.skipWaiting());
sw.addEventListener('activate', (event) => event.waitUntil(sw.clients.claim()));

sw.addEventListener('push', (event) => {
	let data: PushPayload = { title: 'Hush', body: 'Something needs you.', url: '/' };
	try {
		if (event.data) data = event.data.json() as PushPayload;
	} catch {
		// Keep the default text.
	}
	event.waitUntil(
		sw.registration.showNotification(data.title, {
			body: data.body,
			tag: data.tag,
			data: { url: data.url },
			icon: '/icon-192.png',
			badge: '/badge-72.png'
		})
	);
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url: string = event.notification.data?.url ?? '/';
	event.waitUntil(
		(async () => {
			const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
			const same = windows.find((w) => w.url === url);
			if (same) return same.focus();
			return sw.clients.openWindow(url);
		})()
	);
});
