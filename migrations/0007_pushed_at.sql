-- When Hush last sent a push for the thread (ms). A thread pushed recently gets its alert
-- updated when it is resolved.
ALTER TABLE threads ADD COLUMN pushed_at INTEGER;
