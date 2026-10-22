import { MINUTE_MS } from '../../src/lib/shared/durations';
import {
	digestWindowIsOver,
	holdReason,
	limitRoom,
	mayBuzzAgain,
	type DeliveryState,
	type PushMark
} from '../../src/lib/shared/push-policy';
import type { Settings } from '../../src/lib/shared/types';
import type { ItemId } from '../../src/lib/model/types';
import type { PushMessage } from '../webpush';
import type { StoredAlert } from './store';

export const MAX_INDIVIDUAL_PUSHES = 3;
export const DIGEST_LINES = 4;
export const QUIET_RECHECK_MS = 5 * MINUTE_MS;

export type SkipReason = 'held' | 'repeat' | 'app-open' | 'no-channel';

export interface DeliveryContext {
	settings: Pick<
		Settings,
		| 'pushRepeat'
		| 'pushWhileOpen'
		| 'pushUrgentNow'
		| 'smartDecisions'
		| 'quietHours'
		| 'pushDigestMinutes'
		| 'pushLimit'
	>;
	now: number;
	origin: string;
	hasChannel: boolean;
	appInFocus: boolean;
	appSeenAt: number;
	state: DeliveryState;
	lastPushOf(itemId: ItemId): PushMark | null;
	heldByAttention(itemId: ItemId): boolean;
	urgent(itemId: ItemId): boolean;
}

export interface Outgoing {
	message: PushMessage;
	alertIds: string[];
	digest: boolean;
}

export interface DeliveryPlan {
	skip: { alertId: string; reason: SkipReason }[];
	send: Outgoing[];
	waitUntil: number | null;
}

const messageOf = (alert: StoredAlert): PushMessage => ({
	title: alert.title,
	body: alert.body,
	url: alert.url,
	tag: alert.itemId
});

export function digestOf(alerts: StoredAlert[], duringQuiet: boolean, origin: string): PushMessage {
	const noun = alerts.length === 1 ? 'alert' : 'alerts';
	return {
		title: duringQuiet ? `${alerts.length} ${noun} while quiet` : `${alerts.length} ${noun}`,
		body: alerts
			.slice(-DIGEST_LINES)
			.map((alert) => alert.title)
			.join('\n'),
		url: `${origin}/`,
		tag: 'digest'
	};
}

function limitFreesAt(ctx: DeliveryContext): number | null {
	const limit = ctx.settings.pushLimit;
	if (!limit) return null;
	const windowStart = ctx.now - limit.minutes * MINUTE_MS;
	const inWindow = ctx.state.recentSends.filter((at) => at > windowStart).sort((a, b) => a - b);
	return inWindow.length ? inWindow[0] + limit.minutes * MINUTE_MS : null;
}

export function planDelivery(pending: StoredAlert[], ctx: DeliveryContext): DeliveryPlan {
	const plan: DeliveryPlan = { skip: [], send: [], waitUntil: null };
	const skip = (alert: StoredAlert, reason: SkipReason) =>
		plan.skip.push({ alertId: alert.id, reason });
	const sendable: StoredAlert[] = [];
	for (const alert of pending) {
		if (!ctx.hasChannel) skip(alert, 'no-channel');
		else if (ctx.heldByAttention(alert.itemId)) skip(alert, 'held');
		else if (
			!alert.reasons.includes('snooze-over') &&
			!mayBuzzAgain(
				ctx.settings.pushRepeat,
				ctx.lastPushOf(alert.itemId),
				alert.reasons[0],
				ctx.appSeenAt
			)
		)
			skip(alert, 'repeat');
		else if (!ctx.settings.pushWhileOpen && ctx.appInFocus) skip(alert, 'app-open');
		else sendable.push(alert);
	}
	const urgentNow = ctx.settings.smartDecisions && ctx.settings.pushUrgentNow;
	const urgent = urgentNow ? sendable.filter((alert) => ctx.urgent(alert.itemId)) : [];
	const rest = sendable.filter((alert) => !urgent.includes(alert));
	const quietRecheck = ctx.now + QUIET_RECHECK_MS;
	const wait = (at: number | null) => {
		if (at !== null && (plan.waitUntil === null || at < plan.waitUntil)) plan.waitUntil = at;
	};
	if (urgent.length) {
		if (holdReason(ctx.settings, ctx.now, ctx.state, true) === 'quiet') wait(quietRecheck);
		else
			for (const alert of urgent)
				plan.send.push({ message: messageOf(alert), alertIds: [alert.id], digest: false });
	}
	if (!rest.length) return plan;
	const hold = holdReason(ctx.settings, ctx.now, ctx.state, false);
	if (hold === 'quiet') {
		wait(quietRecheck);
		return plan;
	}
	if (hold === 'digest') {
		if (!digestWindowIsOver(ctx.settings, ctx.now, ctx.state)) {
			wait(ctx.state.lastDigestAt + ctx.settings.pushDigestMinutes! * MINUTE_MS);
			return plan;
		}
		if (limitRoom(ctx.settings, ctx.now, ctx.state) === 0) {
			wait(limitFreesAt(ctx));
			return plan;
		}
		const message = rest.length === 1 ? messageOf(rest[0]) : digestOf(rest, false, ctx.origin);
		plan.send.push({ message, alertIds: rest.map((a) => a.id), digest: true });
		return plan;
	}
	const room = limitRoom(ctx.settings, ctx.now, ctx.state) - plan.send.length;
	if (room <= 0) {
		wait(limitFreesAt(ctx));
		return plan;
	}
	if (rest.length <= MAX_INDIVIDUAL_PUSHES)
		for (const alert of rest.slice(0, room))
			plan.send.push({ message: messageOf(alert), alertIds: [alert.id], digest: false });
	else
		plan.send.push({
			message: digestOf(rest, false, ctx.origin),
			alertIds: rest.map((a) => a.id),
			digest: false
		});
	if (rest.length <= MAX_INDIVIDUAL_PUSHES && rest.length > room) wait(limitFreesAt(ctx));
	return plan;
}
