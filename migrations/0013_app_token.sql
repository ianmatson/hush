-- The token from Sign in with GitHub, kept also while a custom token is in use (token_ct): the
-- org access check uses it, so it can tell when an org has approved Hush.
ALTER TABLE users ADD COLUMN app_token_ct TEXT;
ALTER TABLE users ADD COLUMN app_token_iv TEXT;
