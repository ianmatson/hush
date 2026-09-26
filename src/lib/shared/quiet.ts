import type { QuietHours } from './types';

const DAY = 24 * 60;

/** The local weekday (0 = Sunday) and minute of the day at `now` in a time zone. */
function localTime(timeZone: string, now: number): { day: number; minute: number } {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		weekday: 'short',
		hour: 'numeric',
		minute: 'numeric',
		hourCycle: 'h23'
	}).formatToParts(now);
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
	const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
	return { day, minute: Number(get('hour')) * 60 + Number(get('minute')) };
}

/**
 * True when pushes wait: between `from` and `to` each day (the range can cross midnight), and all
 * of Saturday and Sunday when `weekends` is on.
 */
export function inQuietHours(q: QuietHours | null, now = Date.now()): boolean {
	if (!q) return false;
	const { day, minute } = localTime(q.timeZone, now);
	if (q.weekends && (day === 0 || day === 6)) return true;
	return q.from < q.to ? minute >= q.from && minute < q.to : minute >= q.from || minute < q.to;
}

export function validTimeZone(timeZone: unknown): boolean {
	if (typeof timeZone !== 'string' || !timeZone) return false;
	try {
		new Intl.DateTimeFormat('en-US', { timeZone });
		return true;
	} catch {
		return false;
	}
}

/** An error message, or null when `q` is a valid quiet-hours setting (null is: off). */
export function validateQuietHours(q: unknown): string | null {
	if (q === null) return null;
	if (typeof q !== 'object') return 'quietHours must be an object or null.';
	const { from, to, weekends, timeZone } = q as Record<string, unknown>;
	const minute = (m: unknown) => Number.isInteger(m) && (m as number) >= 0 && (m as number) < DAY;
	if (!minute(from) || !minute(to))
		return 'quietHours.from and .to must be minutes after midnight (0 to 1439).';
	if (from === to) return 'Quiet hours must start and end at different times.';
	if (typeof weekends !== 'boolean') return 'quietHours.weekends must be true or false.';
	if (!validTimeZone(timeZone)) return 'quietHours.timeZone is not a known time zone.';
	return null;
}

/** "22:00" for 1320, for <input type="time">. */
export const toClock = (m: number) =>
	`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** 1320 for "22:00"; null for an empty or partial value. */
export function fromClock(s: string): number | null {
	const m = /^(\d{2}):(\d{2})$/.exec(s);
	return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
