-- Sessions: when each was last used (a session ends after 7 days with no use), and which browser
-- it is ("Chrome on macOS"), for the list in Settings.
ALTER TABLE sessions ADD COLUMN last_seen_at INTEGER;
ALTER TABLE sessions ADD COLUMN label TEXT;
UPDATE sessions SET last_seen_at = created_at;

-- Feeds: only the hash of the secret address is kept, like sessions. The addresses that exist are
-- hashed once by a script after this migration (SQLite has no SHA-256).
ALTER TABLE feeds RENAME COLUMN token TO token_hash;
