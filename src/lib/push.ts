import { api } from '$lib/api';

export type PushSupport = 'supported' | 'unsupported' | 'needs-install';

export function pushSupport(): PushSupport {
	if (typeof window === 'undefined') return 'unsupported';
	const hasApis =
		'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
	// iOS only exposes Web Push to sites added to the Home Screen.
	const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
	const standalone = window.matchMedia('(display-mode: standalone)').matches;
	if (ios && !standalone) return 'needs-install';
	return hasApis ? 'supported' : 'unsupported';
}

function keyToBytes(b64url: string): Uint8Array<ArrayBuffer> {
	const b64 =
		b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4);
	return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function currentSubscription(): Promise<PushSubscription | null> {
	if (pushSupport() !== 'supported') return null;
	const reg = await navigator.serviceWorker.getRegistration();
	return (await reg?.pushManager.getSubscription()) ?? null;
}

function deviceLabel(): string {
	const ua = navigator.userAgent;
	const browser = /Edg\//.test(ua)
		? 'Edge'
		: /Firefox\//.test(ua)
			? 'Firefox'
			: /Chrome\//.test(ua)
				? 'Chrome'
				: /Safari\//.test(ua)
					? 'Safari'
					: 'Browser';
	const os =
		/Mac OS X/.test(ua) && !/iPhone|iPad/.test(ua)
			? 'macOS'
			: /iPhone|iPad/.test(ua)
				? 'iOS'
				: /Android/.test(ua)
					? 'Android'
					: /Windows/.test(ua)
						? 'Windows'
						: /Linux/.test(ua)
							? 'Linux'
							: '';
	return [browser, os].filter(Boolean).join(' on ');
}

export async function enablePush(): Promise<void> {
	const { publicKey } = await api.vapidKey();
	if (!publicKey)
		throw new Error('The server has no VAPID key. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.');
	const permission = await Notification.requestPermission();
	if (permission !== 'granted')
		throw new Error('Notifications are blocked for this site in your browser settings.');
	const reg = await navigator.serviceWorker.ready;
	let sub = await reg.pushManager.getSubscription();
	if (!sub)
		sub = await reg.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: keyToBytes(publicKey)
		});
	await api.subscribe(sub.toJSON(), deviceLabel());
}

export async function disablePush(): Promise<void> {
	const sub = await currentSubscription();
	if (!sub) return;
	await api.unsubscribe(sub.endpoint);
	await sub.unsubscribe();
}
