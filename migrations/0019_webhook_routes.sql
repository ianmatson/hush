CREATE TABLE webhook_routes (
  route TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (route, user_id)
);
CREATE INDEX webhook_routes_user ON webhook_routes(user_id);
CREATE TABLE webhook_route_leases (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  renewed_at INTEGER NOT NULL
);
