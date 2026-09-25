-- Alerts Hush pushed, for the history panel (the bell). Kept for 30 days.
CREATE TABLE alert_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT NOT NULL,
  thread_id TEXT
);
CREATE INDEX alert_log_user ON alert_log (user_id, sent_at DESC);
