import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';

const SESSION_TTL_SECONDS = 86_400;
const SESSION_COOKIE = 'hush_sid';
const SESSION_LABEL = 'Local dev session (pnpm dev:session)';
const GITHUB_LOGIN = /^[A-Za-z0-9-]{1,39}$/;

function localD1(sql) {
	const out = execFileSync(
		'npx',
		['wrangler', 'd1', 'execute', 'hush', '--local', '--json', '--command', sql],
		{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
	);
	return JSON.parse(out)[0].results;
}

function pickUser(requestedLogin) {
	const users = localD1('SELECT id, login FROM users ORDER BY login');
	if (!users.length)
		throw new Error('The local database has no users. Sign in once at http://localhost:5173.');
	if (requestedLogin) {
		const user = users.find((u) => u.login.toLowerCase() === requestedLogin.toLowerCase());
		if (!user)
			throw new Error(
				`No local user "${requestedLogin}". Local users: ${users.map((u) => u.login).join(', ')}.`
			);
		return user;
	}
	if (users.length > 1)
		throw new Error(
			`Name a user: pnpm dev:session <login>. Local users: ${users.map((u) => u.login).join(', ')}.`
		);
	return users[0];
}

const requestedLogin = process.argv[2];
if (requestedLogin && !GITHUB_LOGIN.test(requestedLogin))
	throw new Error(`"${requestedLogin}" is not a GitHub login.`);

const user = pickUser(requestedLogin);
const sessionId = randomBytes(32).toString('base64url');
const idHash = createHash('sha256').update(sessionId).digest('base64url');
const now = Date.now();
const expiresAt = now + SESSION_TTL_SECONDS * 1000;
localD1(
	`INSERT INTO sessions (id_hash, user_id, created_at, expires_at, last_seen_at, label) VALUES ('${idHash}', ${Number(user.id)}, ${now}, ${expiresAt}, ${now}, '${SESSION_LABEL}')`
);

console.log(
	`A local session for ${user.login}, for 24 hours. Run this on a page of the dev server:\n`
);
console.log(
	`document.cookie = '${SESSION_COOKIE}=${sessionId}; path=/; max-age=${SESSION_TTL_SECONDS}; samesite=lax'`
);
