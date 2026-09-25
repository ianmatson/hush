-- Items Hush moved to Done by itself (the inbox watcher), and why.
ALTER TABLE threads ADD COLUMN resolved_at INTEGER;
ALTER TABLE threads ADD COLUMN resolved_note TEXT;
-- "Mark as unread" is Hush-only; the GitHub read sync must not undo it.
ALTER TABLE threads ADD COLUMN marked_unread_at INTEGER;
