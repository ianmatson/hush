CREATE TABLE slack_workspaces (
  team_id TEXT PRIMARY KEY,
  team_name TEXT NOT NULL,
  bot_user_id TEXT NOT NULL,
  bot_token_ct TEXT NOT NULL,
  bot_token_iv TEXT NOT NULL,
  installed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE slack_connections (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES slack_workspaces(team_id) ON DELETE CASCADE,
  slack_user_id TEXT NOT NULL,
  dm_channel_id TEXT,
  connected_at INTEGER NOT NULL
);
CREATE INDEX slack_connections_team ON slack_connections(team_id);
