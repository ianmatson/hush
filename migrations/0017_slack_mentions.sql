ALTER TABLE users ADD COLUMN slack_mentions_allowed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN slack_mentions_checked_at INTEGER;

CREATE TABLE slack_mentions_connections (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  slack_user_id TEXT NOT NULL,
  user_token_ct TEXT NOT NULL,
  user_token_iv TEXT NOT NULL,
  connected_at INTEGER NOT NULL
);
