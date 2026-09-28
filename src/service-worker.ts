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
	/** The thread was resolved: replace its alert quietly, then close it. */
	resolve?: boolean;
}

/** How long a "✓ resolved" alert stays before it closes itself. */
const RESOLVED_VISIBLE_MS = 5000;

sw.addEventListener('install', () => sw.skipWaiting());
sw.addEventListener('activate', (event) => event.waitUntil(sw.clients.claim()));

sw.addEventListener('push', (event) => {
	let data: PushPayload = { title: 'Hush', body: 'Something needs you.', url: '/turn' };
	try {
		if (event.data) data = event.data.json() as PushPayload;
	} catch {
		// Keep the default text.
	}
	const options: NotificationOptions = {
		body: data.body,
		tag: data.tag,
		data: { url: data.url },
		icon: '/icon-192.png',
		badge: '/badge-72.png'
	};
	if (!data.resolve) {
		event.waitUntil(sw.registration.showNotification(data.title, options));
		return;
	}
	// A push must always show something (iOS takes the permission away otherwise), so the
	// update is a quiet alert with the same tag. It replaces the old one, then goes away.
	event.waitUntil(
		(async () => {
			await sw.registration.showNotification(data.title, { ...options, silent: true });
			await new Promise((r) => setTimeout(r, RESOLVED_VISIBLE_MS));
			for (const n of await sw.registration.getNotifications({ tag: data.tag }))
				if (n.title === data.title) n.close();
		})()
	);
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url: string = event.notification.data?.url ?? '/turn';
	event.waitUntil(
		(async () => {
			const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
			const same = windows.find((w) => w.url === url);
			if (same) return same.focus();
			return sw.clients.openWindow(url);
		})()
	);
});
