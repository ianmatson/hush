-- The org gate is gone: nothing checks org membership any more.
ALTER TABLE users DROP COLUMN access_checked_at;
