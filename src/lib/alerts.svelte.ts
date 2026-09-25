import { browser } from '$app/environment';

const KEY = 'hush:alerts-seen';

/** When you last opened the alert history on this device (newer alerts are "new"). */
export const alertsSeen = $state({ at: browser ? Number(localStorage.getItem(KEY)) || 0 : 0 });

export function markAlertsSeen(at: number) {
	if (at <= alertsSeen.at) return;
	alertsSeen.at = at;
	localStorage.setItem(KEY, String(at));
}
