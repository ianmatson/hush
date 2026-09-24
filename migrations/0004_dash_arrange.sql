-- "Move to another group" overrides the computed turn until the item changes.
CREATE TABLE dash_moves (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  turn TEXT NOT NULL,                  -- you | team | them | none
  updated_at TEXT NOT NULL,            -- item updatedAt when moved
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_id)
);

-- Your manual order. Lower rank sorts first inside a group; unranked (new) items go on top.
CREATE TABLE dash_order (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_id)
);
