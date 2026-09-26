-- Each user's data now lives in their Durable Object's SQLite (worker/poller/schema.ts).
-- D1 keeps only global data: users (identity and token), sessions, and feeds.
DROP TABLE threads;
DROP TABLE subjects;
DROP TABLE alert_log;
DROP TABLE push_subscriptions;
DROP TABLE dash_hidden;
DROP TABLE dash_moves;
DROP TABLE dash_order;
ALTER TABLE users DROP COLUMN settings;
ALTER TABLE users DROP COLUMN last_poll_at;
ALTER TABLE users DROP COLUMN last_poll_error;
ALTER TABLE users DROP COLUMN threads_version;
ALTER TABLE users DROP COLUMN last_seen_at;
