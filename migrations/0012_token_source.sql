-- Where the stored GitHub token came from: 'app' (the Sign in with GitHub OAuth app) or 'own'
-- (a token the user added in Settings, for orgs that have not approved the app). Tokens stored
-- before sign-in with GitHub were pasted by the user, so they are 'own'.
ALTER TABLE users ADD COLUMN token_source TEXT NOT NULL DEFAULT 'own';
