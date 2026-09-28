/**
 * Sign-in sessions (worker/index.ts and worker/routes/auth.ts). A session ends 30 days after
 * sign-in, or after 7 days with no use, whichever comes first.
 */
export const SESSION_DAYS = 30;
export const SESSION_IDLE_DAYS = 7;
/** Hush writes a session's last use at most this often (a write per request would cost too much). */
export const SESSION_TOUCH_MS = 60 * 60_000;

/** "Chrome on macOS", from a User-Agent: for push devices and sessions. */
export function deviceLabel(ua: string): string {
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
