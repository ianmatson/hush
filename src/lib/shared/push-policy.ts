import { inQuietHours } from './quiet';
import type { Settings } from './types';

const MINUTE_MS = 60_000;

export const APP_FOCUS_MESSAGE = 'focus';
export const APP_BLUR_MESSAGE = 'blur';
export const APP_FOCUS_LASTS_MS = 5 * MINUTE_MS;
export const APP_ACTIVITY_REPORT_GAP_MS = MINUTE_MS;

export type PushRepeat = 'once' | 'reason' | 'every';
export type ClearNotifications = 'open' | 'item' | 'never';
export interface PushLimit {
	count: number;
	minutes: number;
}

export const PUSH_REPEAT_OPTIONS: { id: PushRepeat; label: string }[] = [
	{ id: 'once', label: 'Once, until you open Hush' },
	{ id: 'reason', label: 'Again when the reason changes' },
	{ id: 'every', label: 'Each update' }
];

export const CLEAR_NOTIFICATIONS_OPTIONS: { id: ClearNotifications; label: string }[] = [
	{ id: 'open', label: 'All, when Hush opens' },
	{ id: 'item', label: 'Each one, when you open its item' },
	{ id: 'never', label: 'Never' }
];

export const DIGEST_MINUTES = { min: 5, max: 240 } as const;
export const LIMIT_COUNT = { min: 1, max: 50 } as const;
export const LIMIT_MINUTES = { min: 5, max: 240 } as const;

export interface PushMark {
	pushedAt: number;
	reason: string;
}

export function mayBuzzAgain(
	repeat: PushRepeat,
	mark: PushMark | null,
	reason: string,
	appSeenAt: number
): boolean {
	if (!mark || repeat === 'every' || appSeenAt >= mark.pushedAt) return true;
	return repeat === 'reason' && reason !== mark.reason;
}

export interface DeliveryState {
	recentSends: number[];
	lastDigestAt: number;
}

type DeliverySettings = Pick<Settings, 'quietHours' | 'pushDigestMinutes' | 'pushLimit'>;

export type HoldReason = 'quiet' | 'digest' | 'limit';

function sendsInLimitWindow(limit: PushLimit, now: number, recentSends: number[]): number {
	const windowStart = now - limit.minutes * MINUTE_MS;
	return recentSends.filter((at) => at > windowStart).length;
}

export function limitRoom(settings: DeliverySettings, now: number, state: DeliveryState): number {
	if (!settings.pushLimit) return Number.POSITIVE_INFINITY;
	const used = sendsInLimitWindow(settings.pushLimit, now, state.recentSends);
	return Math.max(0, settings.pushLimit.count - used);
}

export function digestWindowIsOver(
	settings: DeliverySettings,
	now: number,
	state: DeliveryState
): boolean {
	return (
		settings.pushDigestMinutes !== null &&
		now - state.lastDigestAt >= settings.pushDigestMinutes * MINUTE_MS
	);
}

export function holdReason(
	settings: DeliverySettings,
	now: number,
	state: DeliveryState,
	urgent = false
): HoldReason | null {
	if (inQuietHours(settings.quietHours, now)) return 'quiet';
	if (urgent) return null;
	if (settings.pushDigestMinutes !== null) return 'digest';
	if (limitRoom(settings, now, state) === 0) return 'limit';
	return null;
}

export function heldAreDue(settings: DeliverySettings, now: number, state: DeliveryState): boolean {
	if (inQuietHours(settings.quietHours, now)) return false;
	if (settings.pushDigestMinutes !== null) return digestWindowIsOver(settings, now, state);
	return limitRoom(settings, now, state) > 0;
}

export function keptSends(recentSends: number[], now: number, limit: PushLimit | null): number[] {
	if (!limit) return [];
	const windowStart = now - limit.minutes * MINUTE_MS;
	return recentSends.filter((at) => at > windowStart).slice(-LIMIT_COUNT.max);
}

const isWholeIn = (v: unknown, range: { min: number; max: number }) =>
	Number.isInteger(v) && (v as number) >= range.min && (v as number) <= range.max;

export function validatePushRepeat(v: unknown): string | null {
	return PUSH_REPEAT_OPTIONS.some((o) => o.id === v)
		? null
		: '"pushRepeat" must be "once", "reason", or "every".';
}

export function validateClearNotifications(v: unknown): string | null {
	return CLEAR_NOTIFICATIONS_OPTIONS.some((o) => o.id === v)
		? null
		: '"clearNotifications" must be "open", "item", or "never".';
}

export function validateDigestMinutes(v: unknown): string | null {
	return v === null || isWholeIn(v, DIGEST_MINUTES)
		? null
		: `"pushDigestMinutes" must be null or a whole number from ${DIGEST_MINUTES.min} to ${DIGEST_MINUTES.max}.`;
}

export function validatePushLimit(v: unknown): string | null {
	if (v === null) return null;
	if (typeof v !== 'object') return '"pushLimit" must be null or { "count", "minutes" }.';
	const { count, minutes, ...rest } = v as Record<string, unknown>;
	if (Object.keys(rest).length) return '"pushLimit" has only "count" and "minutes".';
	if (!isWholeIn(count, LIMIT_COUNT))
		return `"pushLimit.count" must be a whole number from ${LIMIT_COUNT.min} to ${LIMIT_COUNT.max}.`;
	if (!isWholeIn(minutes, LIMIT_MINUTES))
		return `"pushLimit.minutes" must be a whole number from ${LIMIT_MINUTES.min} to ${LIMIT_MINUTES.max}.`;
	return null;
}
