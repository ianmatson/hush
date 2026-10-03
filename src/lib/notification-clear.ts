import { browser } from '$app/environment';

async function shownNotifications(tag?: string): Promise<Notification[]> {
	if (!browser || !('serviceWorker' in navigator)) return [];
	const registration = await navigator.serviceWorker.getRegistration();
	if (!registration) return [];
	return registration.getNotifications(tag ? { tag } : undefined);
}

async function closeShown(tag?: string) {
	try {
		for (const n of await shownNotifications(tag)) n.close();
	} catch {
		return;
	}
}

export function clearNotificationsFor(itemKey: string) {
	void closeShown(itemKey);
}

export function clearNotificationsWhileAppIsOpen(): () => void {
	const clearIfVisible = () => {
		if (document.visibilityState === 'visible') void closeShown();
	};
	clearIfVisible();
	document.addEventListener('visibilitychange', clearIfVisible);
	window.addEventListener('focus', clearIfVisible);
	return () => {
		document.removeEventListener('visibilitychange', clearIfVisible);
		window.removeEventListener('focus', clearIfVisible);
	};
}
