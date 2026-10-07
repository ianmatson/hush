import type { LiveMessage, MeDTO } from '$lib/shared/types';
import { keys, queryClient } from '$lib/queries';
import { live } from '$lib/live-state.svelte';
import {
	APP_ACTIVITY_REPORT_GAP_MS,
	APP_BLUR_MESSAGE,
	APP_FOCUS_MESSAGE
} from '$lib/shared/push-policy';

/**
 * The live socket to your Durable Object. While it is open, the server says what changed and the
 * tab refetches only that; the timed refetches pause (see `whileOffline` in queries.ts). While it
 * is down, those timers run, and the socket reconnects with backoff.
 */
const PING_EVERY = 30_000;
const MAX_BACKOFF = 60_000;

function apply(m: LiveMessage) {
	switch (m.type) {
		case 'threads':
			// The first-run card's counts too (only fetched while it shows).
			queryClient.invalidateQueries({ queryKey: ['summary'] });
			return queryClient.invalidateQueries({ queryKey: keys.threadsAll });
		case 'alerts':
			return queryClient.invalidateQueries({ queryKey: keys.alerts });
		case 'dash':
			return queryClient.invalidateQueries({ queryKey: keys.dash(m.kind) });
		case 'settings':
			return queryClient.invalidateQueries({ queryKey: keys.me });
		case 'syncing':
			live.syncing = m.on;
			return;
		case 'status':
			// No request: the message has the values.
			return queryClient.setQueryData<MeDTO>(keys.me, (old) =>
				old
					? {
							...old,
							lastPollAt: m.lastPollAt,
							nextPollAt: m.nextPollAt,
							lastPollError: m.lastPollError,
							ssoHiddenOrgs: m.ssoHiddenOrgs,
							firstSync: m.firstSync
						}
					: old
			);
	}
}

const appInUse = () => document.visibilityState === 'visible' && document.hasFocus();
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

function reportFocus(socket: () => WebSocket | null): () => void {
	let lastReportAt = 0;
	const send = (message: string) => {
		const ws = socket();
		if (ws?.readyState === WebSocket.OPEN) ws.send(message);
	};
	const focused = () => {
		if (!appInUse()) return;
		lastReportAt = Date.now();
		send(APP_FOCUS_MESSAGE);
	};
	const active = () => {
		if (Date.now() - lastReportAt >= APP_ACTIVITY_REPORT_GAP_MS) focused();
	};
	const blurred = () => {
		lastReportAt = 0;
		send(APP_BLUR_MESSAGE);
	};
	const visibility = () => (document.visibilityState === 'visible' ? focused() : blurred());
	window.addEventListener('focus', focused);
	window.addEventListener('blur', blurred);
	document.addEventListener('visibilitychange', visibility);
	for (const type of ACTIVITY_EVENTS) window.addEventListener(type, active, { passive: true });
	return () => {
		window.removeEventListener('focus', focused);
		window.removeEventListener('blur', blurred);
		document.removeEventListener('visibilitychange', visibility);
		for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, active);
	};
}

/** Open the socket (once per page, when signed in); returns a function that closes it. */
export function connectLive(): () => void {
	let ws: WebSocket | null = null;
	let retry: ReturnType<typeof setTimeout> | undefined;
	let ping: ReturnType<typeof setInterval> | undefined;
	let backoff = 1000;
	let stopped = false;
	let opened = false;

	const open = () => {
		const proto = location.protocol === 'https:' ? 'wss' : 'ws';
		ws = new WebSocket(`${proto}://${location.host}/api/live`);
		ws.onopen = () => {
			live.connected = true;
			if (appInUse()) ws?.send(APP_FOCUS_MESSAGE);
			backoff = 1000;
			ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send('ping'), PING_EVERY);
			// Back after a drop: catch up on what changed while the socket was down.
			if (opened)
				for (const queryKey of [keys.threadsAll, keys.dashAll, keys.alerts, keys.me])
					void queryClient.invalidateQueries({ queryKey });
			opened = true;
		};
		ws.onmessage = (e) => {
			if (e.data === 'pong') return;
			try {
				apply(JSON.parse(e.data) as LiveMessage);
			} catch {
				// Not ours.
			}
		};
		ws.onclose = () => {
			live.connected = false;
			live.syncing = false;
			clearInterval(ping);
			if (stopped) return;
			retry = setTimeout(open, backoff);
			backoff = Math.min(backoff * 2, MAX_BACKOFF);
		};
	};

	// Phones drop sockets in the background: coming back reconnects at once.
	const onVisible = () => {
		if (document.visibilityState !== 'visible' || stopped) return;
		if (!ws || ws.readyState === WebSocket.CLOSED) {
			clearTimeout(retry);
			backoff = 1000;
			open();
		}
	};
	document.addEventListener('visibilitychange', onVisible);
	const stopFocusReports = reportFocus(() => ws);
	open();
	return () => {
		stopped = true;
		clearTimeout(retry);
		clearInterval(ping);
		stopFocusReports();
		document.removeEventListener('visibilitychange', onVisible);
		ws?.close();
		live.connected = false;
		live.syncing = false;
	};
}
