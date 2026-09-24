-- Users sign in with a GitHub token. The token is AES-GCM encrypted at rest.
CREATE TABLE users (
  id INTEGER PRIMARY KEY,            -- GitHub user id
  login TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  token_ct TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '',
  settings TEXT NOT NULL DEFAULT '{}',
  last_poll_at INTEGER,
  last_poll_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,          -- sha256 of the cookie value
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- One row per GitHub notification thread per user.
CREATE TABLE threads (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,                  -- GitHub thread id
  repo TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  title TEXT NOT NULL,
  html_url TEXT NOT NULL,
  reason TEXT NOT NULL,
  unread INTEGER NOT NULL DEFAULT 1,
  gh_updated_at TEXT NOT NULL,
  enrichment TEXT,                   -- JSON Enrichment, or NULL
  category TEXT NOT NULL,            -- action | fyi | muted
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  why TEXT NOT NULL,
  action_label TEXT NOT NULL,
  action_url TEXT NOT NULL,
  rule TEXT,
  triage TEXT NOT NULL DEFAULT 'inbox', -- inbox | done | snoozed
  snoozed_until INTEGER,
  pushed_updated_at TEXT,            -- gh_updated_at of the last push we sent
  first_seen_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX threads_user_updated ON threads(user_id, gh_updated_at DESC);
CREATE INDEX threads_user_view ON threads(user_id, triage, category);

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  label TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX push_user ON push_subscriptions(user_id);

-- Atom feeds of saved filters, addressed by a secret token.
CREATE TABLE feeds (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  filter TEXT NOT NULL,              -- JSON FeedFilter
  created_at INTEGER NOT NULL
);
CREATE INDEX feeds_user ON feeds(user_id);
