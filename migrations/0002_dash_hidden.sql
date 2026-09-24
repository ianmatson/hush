-- PRs and issues hidden from a dashboard until they change.
CREATE TABLE dash_hidden (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,               -- GraphQL node id
  updated_at TEXT NOT NULL,            -- item updatedAt when hidden
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_id)
);
