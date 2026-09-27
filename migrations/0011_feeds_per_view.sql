-- A feed is now one inbox tab (a built-in tab or a saved view) as Atom, one per tab. The name
-- and the conditions come from the user's settings when the feed is read.
DROP TABLE feeds;
CREATE TABLE feeds (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  view TEXT NOT NULL,                -- 'action', 'fyi', 'inbox', or 'v:<saved view id>'
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, view)
);
