-- Snooze until something happens (CI passes, a reply, …). snoozed_until stays the deadline.
ALTER TABLE threads ADD COLUMN snooze_event TEXT;
-- When the snooze started: "a new reply" means one after this time.
ALTER TABLE threads ADD COLUMN snoozed_at INTEGER;
