-- Bumped on every change to a user's threads. The inbox API answers 304 when it is unchanged.
ALTER TABLE users ADD COLUMN threads_version INTEGER NOT NULL DEFAULT 0;
-- Last time the user opened Hush (throttled to one write per few minutes).
ALTER TABLE users ADD COLUMN last_seen_at INTEGER;
-- Last time we checked the user is still in an allowed org.
ALTER TABLE users ADD COLUMN access_checked_at INTEGER;
-- Finds snoozes that are due without scanning all threads.
CREATE INDEX threads_user_snooze ON threads(user_id, triage, snoozed_until);
