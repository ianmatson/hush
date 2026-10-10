import type { Settings } from '../../src/lib/shared/types';
import type { ProjectAccess } from '../../src/lib/shared/projects';
import { APP_FOCUS_LASTS_MS } from '../../src/lib/shared/push-policy';

export { APP_BLUR_MESSAGE, APP_FOCUS_MESSAGE } from '../../src/lib/shared/push-policy';

export const MIN = 60_000;
export const FOCUS_COUNTS_FOR = APP_FOCUS_LASTS_MS;
export const PUSH_MARK_KEEP = 30 * 24 * 60 * MIN;
export const ACTIVE_WINDOW = 15 * MIN;
export const MAX_INDIVIDUAL_PUSHES = 3;
export const TEAMS_TTL = 6 * 60 * MIN;
export const DAY = 24 * 60 * MIN;
// Stop polling for accounts nobody uses. Opening Hush (or signing in) starts it again.
export const PAUSE_AFTER_NO_PUSH = 14 * DAY;
export const PAUSE_AFTER_WITH_PUSH = 90 * DAY;
/** The alert history (the bell) keeps this long. */
export const ALERT_LOG_KEEP = 30 * DAY;

// Poll every 5 minutes while someone can see the result (push on, or Hush open lately), else
// every 15. Push arrives a few minutes late, but each user costs a fifth of the Cloudflare budget.
export const POLL_ACTIVE = 5 * MIN;
export const POLL_IDLE = 15 * MIN;
export const DASH_TTL = 15 * MIN;
export const TRACKED_KEEP = 14 * DAY;
export const TRACKED_SEEN_REFRESH = DAY;
export const TRACKED_REBUILD_GAP = 5 * MIN;
export const FILL_MAX = 500;
export const NOTIFICATION_KEEP = 30 * DAY;

export interface PollStatus {
	lastPollAt: number | null;
	lastError: string | null;
	nextPollAt: number | null;
	smartDecisionsPaused?: boolean;
	smartDecisionsChecking?: boolean;
}

/** The signed-in user, as every layer needs them for one piece of work. */
export interface Who {
	userId: number;
	me: string;
	token: string;
	settings: Settings;
	projectAccess: ProjectAccess;
}
