-- The one record of each PR or issue's facts (SubjectFacts JSON), per user. Every GitHub read of
-- a PR or issue writes here when something changed; inbox threads and the cached dashboards are
-- updated from it (see Poller.recordSubjects).
CREATE TABLE subjects (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  facts TEXT NOT NULL,
  changed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);
