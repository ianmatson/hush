import { decryptSecret, encryptSecret } from './crypto';
import type { Env } from './db';
import type { SlackInstall } from './slack';
import type { SlackMentionsInstall } from './slack-mentions';

const botTokenContext = (teamId: string) => `slack:${teamId}:bot_token`;

export interface SlackConnection {
	teamId: string;
	teamName: string;
	slackUserId: string;
	dmChannelId: string | null;
	connectedAt: number;
}

export interface SlackConnectionWithToken extends SlackConnection {
	botToken: string;
}

interface ConnectionRow {
	team_id: string;
	team_name: string;
	slack_user_id: string;
	dm_channel_id: string | null;
	connected_at: number;
	bot_token_ct: string;
	bot_token_iv: string;
}

export async function saveSlackInstall(env: Env, userId: number, install: SlackInstall) {
	const now = Date.now();
	const { ct, iv } = await encryptSecret(
		install.botToken,
		env.TOKEN_ENC_KEY,
		botTokenContext(install.teamId)
	);
	await env.DB.batch([
		env.DB.prepare(
			`INSERT INTO slack_workspaces (team_id, team_name, bot_user_id, bot_token_ct, bot_token_iv, installed_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
       ON CONFLICT (team_id) DO UPDATE SET team_name = excluded.team_name, bot_user_id = excluded.bot_user_id,
         bot_token_ct = excluded.bot_token_ct, bot_token_iv = excluded.bot_token_iv, updated_at = excluded.updated_at`
		).bind(install.teamId, install.teamName, install.botUserId, ct, iv, now),
		env.DB.prepare(
			`INSERT INTO slack_connections (user_id, team_id, slack_user_id, dm_channel_id, connected_at)
       VALUES (?1, ?2, ?3, NULL, ?4)
       ON CONFLICT (user_id) DO UPDATE SET team_id = excluded.team_id, slack_user_id = excluded.slack_user_id,
         dm_channel_id = NULL, connected_at = excluded.connected_at`
		).bind(userId, install.teamId, install.slackUserId, now)
	]);
}

function connectionRow(env: Env, userId: number) {
	return env.DB.prepare(
		`SELECT c.team_id, w.team_name, c.slack_user_id, c.dm_channel_id, c.connected_at, w.bot_token_ct, w.bot_token_iv
     FROM slack_connections c JOIN slack_workspaces w ON w.team_id = c.team_id
     WHERE c.user_id = ?`
	)
		.bind(userId)
		.first<ConnectionRow>();
}

const connectionOf = (row: ConnectionRow): SlackConnection => ({
	teamId: row.team_id,
	teamName: row.team_name,
	slackUserId: row.slack_user_id,
	dmChannelId: row.dm_channel_id,
	connectedAt: row.connected_at
});

export async function slackConnection(env: Env, userId: number): Promise<SlackConnection | null> {
	const row = await connectionRow(env, userId);
	return row ? connectionOf(row) : null;
}

export async function slackConnectionWithToken(
	env: Env,
	userId: number
): Promise<SlackConnectionWithToken | null> {
	const row = await connectionRow(env, userId);
	if (!row) return null;
	const botToken = await decryptSecret(
		row.bot_token_ct,
		row.bot_token_iv,
		env.TOKEN_ENC_KEY,
		botTokenContext(row.team_id)
	);
	return { ...connectionOf(row), botToken };
}

export async function saveDirectMessageChannel(env: Env, userId: number, channelId: string) {
	await env.DB.prepare('UPDATE slack_connections SET dm_channel_id = ? WHERE user_id = ?')
		.bind(channelId, userId)
		.run();
}

export async function removeSlackConnection(env: Env, userId: number) {
	await env.DB.prepare('DELETE FROM slack_connections WHERE user_id = ?').bind(userId).run();
}

export async function removeSlackWorkspace(env: Env, teamId: string): Promise<number[]> {
	const connected = await env.DB.prepare('SELECT user_id FROM slack_connections WHERE team_id = ?')
		.bind(teamId)
		.all<{ user_id: number }>();
	await env.DB.batch([
		env.DB.prepare('DELETE FROM slack_connections WHERE team_id = ?').bind(teamId),
		env.DB.prepare('DELETE FROM slack_workspaces WHERE team_id = ?').bind(teamId)
	]);
	return connected.results.map((r) => r.user_id);
}

const mentionsTokenContext = (userId: number) => `slack-mentions:${userId}:user_token`;

export async function saveSlackMentionsInstall(
	env: Env,
	userId: number,
	install: SlackMentionsInstall
) {
	const { ct, iv } = await encryptSecret(
		install.userToken,
		env.TOKEN_ENC_KEY,
		mentionsTokenContext(userId)
	);
	await env.DB.prepare(
		`INSERT INTO slack_mentions_connections (user_id, slack_user_id, user_token_ct, user_token_iv, connected_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (user_id) DO UPDATE SET slack_user_id = excluded.slack_user_id, user_token_ct = excluded.user_token_ct,
       user_token_iv = excluded.user_token_iv, connected_at = excluded.connected_at`
	)
		.bind(userId, install.slackUserId, ct, iv, Date.now())
		.run();
}

export async function slackMentionsToken(env: Env, userId: number): Promise<string | null> {
	const row = await env.DB.prepare(
		'SELECT user_token_ct, user_token_iv FROM slack_mentions_connections WHERE user_id = ?'
	)
		.bind(userId)
		.first<{ user_token_ct: string; user_token_iv: string }>();
	if (!row) return null;
	return decryptSecret(
		row.user_token_ct,
		row.user_token_iv,
		env.TOKEN_ENC_KEY,
		mentionsTokenContext(userId)
	);
}

export async function removeSlackMentions(env: Env, userId: number) {
	await env.DB.prepare('DELETE FROM slack_mentions_connections WHERE user_id = ?')
		.bind(userId)
		.run();
}

export async function slackMentionsAllowed(env: Env, userId: number): Promise<boolean> {
	const row = await env.DB.prepare('SELECT slack_mentions_allowed FROM users WHERE id = ?')
		.bind(userId)
		.first<{ slack_mentions_allowed: number }>();
	return row?.slack_mentions_allowed === 1;
}

export async function slackMentionsCheckedAt(env: Env, userId: number): Promise<number | null> {
	const row = await env.DB.prepare('SELECT slack_mentions_checked_at FROM users WHERE id = ?')
		.bind(userId)
		.first<{ slack_mentions_checked_at: number | null }>();
	return row?.slack_mentions_checked_at ?? null;
}

export async function saveSlackMentionsAccess(env: Env, userId: number, allowed: boolean) {
	const writes = [
		env.DB.prepare(
			'UPDATE users SET slack_mentions_allowed = ?, slack_mentions_checked_at = ? WHERE id = ?'
		).bind(allowed ? 1 : 0, Date.now(), userId)
	];
	if (!allowed)
		writes.push(
			env.DB.prepare('DELETE FROM slack_mentions_connections WHERE user_id = ?').bind(userId)
		);
	await env.DB.batch(writes);
}
