import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Context } from 'hono';
import type { SlackMentionDTO, SlackStatusDTO } from '../../src/lib/shared/types';
import { randomToken } from '../crypto';
import { appToken } from '../db';
import { poller, routes, type AppEnv } from '../app';
import {
	SLACK_AUTHORIZE_URL,
	SLACK_BOT_SCOPES,
	exchangeSlackCode,
	slackCallbackUrl,
	slackEventOutcome,
	slackIsConfigured,
	slackSignatureIsValid,
	tokenWasRevoked
} from '../slack';
import {
	SLACK_MENTIONS_USER_SCOPES,
	exchangeMentionsCode,
	refreshSlackMentionsAccess,
	searchMentions,
	slackMentionsCallbackUrl,
	slackMentionsConfigured
} from '../slack-mentions';
import {
	removeSlackConnection,
	removeSlackMentions,
	removeSlackWorkspace,
	saveSlackInstall,
	saveSlackMentionsInstall,
	slackConnection,
	slackMentionsAllowed,
	slackMentionsToken
} from '../slack-store';
import { sendSlackDirectMessage } from '../slack-delivery';

const STATE_COOKIE = 'hush_slack_oauth';
const STATE_COOKIE_PATH = '/api/slack';
const MENTIONS_STATE_COOKIE = 'hush_slack_mentions_oauth';
const MENTIONS_STATE_COOKIE_PATH = '/api/slack/mentions';
const STATE_MAX_AGE_SECONDS = 600;
const SETTINGS_PATH = '/settings/notifications';
const GITHUB_NAME = /^[A-Za-z0-9_.-]{1,100}$/;

function startOAuth(
	c: Context<AppEnv>,
	cookie: { name: string; path: string },
	authorize: Record<string, string>
) {
	const state = randomToken(16);
	setCookie(c, cookie.name, state, {
		httpOnly: true,
		secure: true,
		sameSite: 'Lax',
		path: cookie.path,
		maxAge: STATE_MAX_AGE_SECONDS
	});
	const url = new URL(SLACK_AUTHORIZE_URL);
	url.search = new URLSearchParams({ ...authorize, state }).toString();
	return c.redirect(url.toString());
}

const settingsUrl = (c: Context<AppEnv>, params: Record<string, string>) =>
	`${c.env.APP_URL}${SETTINGS_PATH}?${new URLSearchParams(params)}`;

async function mentionsStatus(c: Context<AppEnv>): Promise<SlackStatusDTO['mentions']> {
	const user = c.get('user');
	if (!slackMentionsConfigured(c.env)) return { available: false, connected: false };
	const githubToken = await appToken(c.env, user).catch(() => null);
	if (githubToken)
		await refreshSlackMentionsAccess(c.env, user.id, githubToken).catch((err) =>
			console.error('slack mentions access check failed', (err as Error).message)
		);
	if (!(await slackMentionsAllowed(c.env, user.id))) return { available: false, connected: false };
	return { available: true, connected: !!(await slackMentionsToken(c.env, user.id)) };
}

const TEST_MESSAGE = {
	text: 'Hush is connected. Your alerts can come here.'
};

const app = routes()
	.get('/api/slack', async (c) => {
		const available = slackIsConfigured(c.env);
		const connection = available ? await slackConnection(c.env, c.get('user').id) : null;
		return c.json({
			available,
			connection: connection
				? { teamName: connection.teamName, connectedAt: connection.connectedAt }
				: null,
			mentions: await mentionsStatus(c)
		} satisfies SlackStatusDTO);
	})
	.get('/api/slack/connect', (c) => {
		if (!slackIsConfigured(c.env)) return c.json({ error: 'Slack is not set up here.' }, 404);
		return startOAuth(
			c,
			{ name: STATE_COOKIE, path: STATE_COOKIE_PATH },
			{
				client_id: c.env.SLACK_CLIENT_ID ?? '',
				scope: SLACK_BOT_SCOPES.join(','),
				redirect_uri: slackCallbackUrl(c.env)
			}
		);
	})
	.get('/api/slack/callback', async (c) => {
		const fail = (message: string) => c.redirect(settingsUrl(c, { slack_error: message }));
		const state = getCookie(c, STATE_COOKIE);
		deleteCookie(c, STATE_COOKIE, { path: STATE_COOKIE_PATH });
		if (!slackIsConfigured(c.env)) return fail('Slack is not set up here.');
		if (c.req.query('error')) return fail('The Slack connection was cancelled.');
		if (!state || state !== c.req.query('state')) return fail('The Slack link expired. Try again.');
		const code = c.req.query('code');
		if (!code) return fail('Slack did not send a code. Try again.');

		const install = await exchangeSlackCode(c.env, code);
		if ('error' in install) return fail(install.error);
		await saveSlackInstall(c.env, c.get('user').id, install);
		await poller(c.env, c.get('user').id).alertChannelsChanged();
		return c.redirect(settingsUrl(c, { slack: 'connected' }));
	})
	.delete('/api/slack', async (c) => {
		await removeSlackConnection(c.env, c.get('user').id);
		await poller(c.env, c.get('user').id).alertChannelsChanged();
		return c.json({ ok: true });
	})
	.post('/api/slack/test', async (c) => {
		const delivery = await sendSlackDirectMessage(c.env, c.get('user').id, TEST_MESSAGE);
		if (delivery.sent) return c.json({ ok: true });
		if (delivery.reason === 'not-connected') return c.json({ error: 'Connect Slack first.' }, 409);
		if (delivery.reason === 'revoked' || delivery.reason === 'user-gone')
			return c.json({ error: 'Slack removed the connection. Connect Slack again.' }, 410);
		return c.json({ error: `Slack did not send the message (${delivery.error}).` }, 502);
	})
	.get('/api/slack/mentions/connect', async (c) => {
		if (!slackMentionsConfigured(c.env) || !(await slackMentionsAllowed(c.env, c.get('user').id)))
			return c.json({ error: 'Slack mentions are not available for you.' }, 404);
		return startOAuth(
			c,
			{ name: MENTIONS_STATE_COOKIE, path: MENTIONS_STATE_COOKIE_PATH },
			{
				client_id: c.env.SLACK_MENTIONS_CLIENT_ID ?? '',
				user_scope: SLACK_MENTIONS_USER_SCOPES.join(','),
				redirect_uri: slackMentionsCallbackUrl(c.env),
				team: c.env.SLACK_MENTIONS_TEAM_ID ?? ''
			}
		);
	})
	.get('/api/slack/mentions/callback', async (c) => {
		const fail = (message: string) => c.redirect(settingsUrl(c, { slack_error: message }));
		const state = getCookie(c, MENTIONS_STATE_COOKIE);
		deleteCookie(c, MENTIONS_STATE_COOKIE, { path: MENTIONS_STATE_COOKIE_PATH });
		const userId = c.get('user').id;
		if (!slackMentionsConfigured(c.env) || !(await slackMentionsAllowed(c.env, userId)))
			return fail('Slack mentions are not available for you.');
		if (c.req.query('error')) return fail('The Slack connection was cancelled.');
		if (!state || state !== c.req.query('state')) return fail('The Slack link expired. Try again.');
		const code = c.req.query('code');
		if (!code) return fail('Slack did not send a code. Try again.');

		const install = await exchangeMentionsCode(c.env, code);
		if ('error' in install) return fail(install.error);
		await saveSlackMentionsInstall(c.env, userId, install);
		return c.redirect(settingsUrl(c, { slack: 'mentions-connected' }));
	})
	.delete('/api/slack/mentions', async (c) => {
		await removeSlackMentions(c.env, c.get('user').id);
		return c.json({ ok: true });
	})
	.get('/api/slack/mentions/:owner/:repo/:number', async (c) => {
		const noStore = { 'Cache-Control': 'private, no-store' };
		const { owner, repo } = c.req.param();
		const number = Number(c.req.param('number'));
		if (!GITHUB_NAME.test(owner) || !GITHUB_NAME.test(repo) || !Number.isSafeInteger(number))
			return c.json({ error: 'Bad PR or issue.' }, 400, noStore);
		const userId = c.get('user').id;
		if (!slackMentionsConfigured(c.env) || !(await slackMentionsAllowed(c.env, userId)))
			return c.json({ error: 'Slack mentions are not available for you.' }, 404, noStore);
		const token = await slackMentionsToken(c.env, userId);
		if (!token) return c.json({ error: 'Connect Slack mentions first.' }, 409, noStore);
		const found = await searchMentions(token, { owner, repo, number });
		if (found.ok)
			return c.json({ mentions: found.mentions satisfies SlackMentionDTO[] }, 200, noStore);
		if (tokenWasRevoked(found.error)) {
			await removeSlackMentions(c.env, userId);
			return c.json({ error: 'Slack removed the connection. Connect again.' }, 410, noStore);
		}
		if (found.error === 'ratelimited' || found.error === 'rate_limited')
			return c.json({ error: 'Slack search is busy. Try again in a minute.' }, 429, noStore);
		return c.json({ error: `Slack search failed (${found.error}).` }, 502, noStore);
	})
	.post('/api/slack/events', async (c) => {
		const body = await c.req.text();
		const signed = await slackSignatureIsValid(c.env.SLACK_SIGNING_SECRET ?? '', {
			timestamp: c.req.header('X-Slack-Request-Timestamp'),
			signature: c.req.header('X-Slack-Signature'),
			body
		});
		if (!signed) return c.json({ error: 'Bad signature' }, 401);
		let payload: Parameters<typeof slackEventOutcome>[0];
		try {
			payload = JSON.parse(body);
		} catch {
			return c.json({ error: 'Bad JSON' }, 400);
		}
		const outcome = slackEventOutcome(payload);
		if (outcome.kind === 'challenge') return c.json({ challenge: outcome.challenge });
		if (outcome.kind === 'workspace-removed') {
			const userIds = await removeSlackWorkspace(c.env, outcome.teamId);
			c.executionCtx.waitUntil(
				Promise.allSettled(userIds.map((id) => poller(c.env, id).alertChannelsChanged()))
			);
		}
		return c.json({ ok: true });
	});

export default app;
