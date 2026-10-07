import type { Env } from './db';

const SLACK_API = 'https://slack.com/api';
export const SLACK_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
export const SLACK_BOT_SCOPES = ['chat:write', 'im:write'];
const SIGNATURE_VERSION = 'v0';
const SIGNATURE_MAX_AGE_SECONDS = 5 * 60;
const REVOKED_ERRORS = new Set(['invalid_auth', 'not_authed', 'account_inactive', 'token_revoked']);
const USER_GONE_ERRORS = new Set(['user_not_found', 'user_disabled']);

export type SlackAnswer<T> = ({ ok: true } & T) | { ok: false; error: string };

export const slackIsConfigured = (env: Env) => !!(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET);

export const slackCallbackUrl = (env: Env) => `${env.APP_URL}/api/slack/callback`;

export const tokenWasRevoked = (error: string) => REVOKED_ERRORS.has(error);

export const userIsGone = (error: string) => USER_GONE_ERRORS.has(error);

async function slackAnswer<T>(res: Response): Promise<SlackAnswer<T>> {
	if (!res.ok) return { ok: false, error: `http_${res.status}` };
	return (await res
		.json()
		.catch(() => ({ ok: false, error: 'invalid_response' }))) as SlackAnswer<T>;
}

async function callSlack<T>(
	method: string,
	token: string,
	body: Record<string, unknown>
): Promise<SlackAnswer<T>> {
	const res = await fetch(`${SLACK_API}/${method}`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json; charset=utf-8'
		},
		body: JSON.stringify(body)
	});
	return slackAnswer<T>(res);
}

export interface SlackInstall {
	teamId: string;
	teamName: string;
	botUserId: string;
	botToken: string;
	slackUserId: string;
}

interface OAuthAccessAnswer {
	access_token?: string;
	token_type?: string;
	bot_user_id?: string;
	team?: { id: string; name: string } | null;
	authed_user?: { id: string };
	is_enterprise_install?: boolean;
}

export function installFrom(
	answer: SlackAnswer<OAuthAccessAnswer>
): SlackInstall | { error: string } {
	if (!answer.ok) return { error: `Slack did not connect (${answer.error}).` };
	if (answer.is_enterprise_install || !answer.team)
		return { error: 'Hush does not support installs for a whole Enterprise Grid org yet.' };
	const { access_token, token_type, bot_user_id, team, authed_user } = answer;
	if (token_type !== 'bot' || !access_token || !bot_user_id || !authed_user?.id)
		return { error: 'Slack sent an incomplete answer. Try again.' };
	return {
		teamId: team.id,
		teamName: team.name,
		botUserId: bot_user_id,
		botToken: access_token,
		slackUserId: authed_user.id
	};
}

export async function exchangeSlackCode(
	env: Env,
	code: string
): Promise<SlackInstall | { error: string }> {
	const res = await fetch(`${SLACK_API}/oauth.v2.access`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: env.SLACK_CLIENT_ID ?? '',
			client_secret: env.SLACK_CLIENT_SECRET ?? '',
			code,
			redirect_uri: slackCallbackUrl(env)
		})
	});
	return installFrom(await slackAnswer<OAuthAccessAnswer>(res));
}

export async function openDirectMessage(
	botToken: string,
	slackUserId: string
): Promise<SlackAnswer<{ channelId: string }>> {
	const answer = await callSlack<{ channel: { id: string } }>('conversations.open', botToken, {
		users: slackUserId
	});
	return answer.ok ? { ok: true, channelId: answer.channel.id } : answer;
}

export interface SlackMessage {
	text: string;
	blocks?: unknown[];
}

export function postSlackMessage(
	botToken: string,
	channelId: string,
	message: SlackMessage
): Promise<SlackAnswer<{ ts: string }>> {
	return callSlack<{ ts: string }>('chat.postMessage', botToken, {
		channel: channelId,
		unfurl_links: false,
		unfurl_media: false,
		...message
	});
}

function toHex(bytes: ArrayBuffer): string {
	return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function equalInConstantTime(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let difference = 0;
	for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return difference === 0;
}

export async function slackSignatureIsValid(
	signingSecret: string,
	request: { timestamp: string | undefined; signature: string | undefined; body: string },
	nowSeconds = Math.floor(Date.now() / 1000)
): Promise<boolean> {
	const { timestamp, signature, body } = request;
	if (!signingSecret || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
	if (Math.abs(nowSeconds - Number(timestamp)) > SIGNATURE_MAX_AGE_SECONDS) return false;
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(signingSecret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const mac = await crypto.subtle.sign(
		'HMAC',
		key,
		new TextEncoder().encode(`${SIGNATURE_VERSION}:${timestamp}:${body}`)
	);
	return equalInConstantTime(`${SIGNATURE_VERSION}=${toHex(mac)}`, signature);
}

export type SlackEventOutcome =
	| { kind: 'challenge'; challenge: string }
	| { kind: 'workspace-removed'; teamId: string }
	| { kind: 'ignored' };

interface SlackEventPayload {
	type?: string;
	challenge?: string;
	team_id?: string;
	event?: { type?: string; tokens?: { bot?: string[]; oauth?: string[] } };
}

export function slackEventOutcome(payload: SlackEventPayload): SlackEventOutcome {
	if (payload.type === 'url_verification' && payload.challenge)
		return { kind: 'challenge', challenge: payload.challenge };
	if (payload.type !== 'event_callback' || !payload.team_id) return { kind: 'ignored' };
	const event = payload.event;
	const botTokensRevoked = event?.type === 'tokens_revoked' && !!event.tokens?.bot?.length;
	if (event?.type === 'app_uninstalled' || botTokensRevoked)
		return { kind: 'workspace-removed', teamId: payload.team_id };
	return { kind: 'ignored' };
}
