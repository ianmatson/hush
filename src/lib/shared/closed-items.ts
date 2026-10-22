import type { CloseReason, DashItem, DashKind, ItemView } from './types';

export const KEEP_CLOSED_HOURS = 24;
export const KEEP_CLOSED_MS = KEEP_CLOSED_HOURS * 3600_000;

type ClosedTimes = Pick<DashItem, 'closedAt' | 'updatedAt'>;

const CLOSED_AS: Record<CloseReason, string> = {
	completed: 'Closed',
	not_planned: 'Closed as not planned',
	duplicate: 'Closed as duplicate'
};

export const closedLabel = (reason: CloseReason | null | undefined) =>
	reason ? CLOSED_AS[reason] : 'Closed';

export const keepsClosed = (view: Pick<ItemView, 'keepClosed'>) => view.keepClosed !== false;

const ONLY_OPEN = /(?:^|\s)(?:is|state):open(?=\s|$)/i;

export const searchFindsOnlyOpen = (search: string) => ONLY_OPEN.test(search);

export const closedTimeOf = (i: ClosedTimes) => i.closedAt ?? i.updatedAt;

export const stillKept = (i: ClosedTimes, now: number) =>
	now - Date.parse(closedTimeOf(i)) < KEEP_CLOSED_MS;

export const newestCloseFirst = (a: ClosedTimes, b: ClosedTimes) =>
	Date.parse(closedTimeOf(b)) - Date.parse(closedTimeOf(a));

export const closedSectionLabel = (kinds: DashKind[]) =>
	kinds.includes('pr') ? 'Merged and closed' : 'Closed';
