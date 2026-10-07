import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { SlackStatusDTO } from '../../src/lib/shared/types';
import { randomToken } from '../crypto';
import { poller, routes } from '../app';
import {
	SLACK_AUTHORIZE_URL,
	SLACK_BOT_SCOPES,
	exchangeSlackCode,
	slackCallbackUrl,
	slackEventOutcome,
	slackIsConfigured,
	slackSignatureIsValid
} from '../slack';
import {
	removeSlackConnection,
	removeSlackWorkspace,
	saveSlackInstall,
	slackConnection
} from '../slack-store';
import { sendSlackDirectMessage } from '../slack-delivery';

const STATE_COOKIE = 'hush_slack_oauth';
const STATE_COOKIE_PATH = '/api/slack';
const STATE_MAX_AGE_SECONDS = 600;
const SETTINGS_PATH = '/settings/notifications';

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
				: null
		} satisfies SlackStatusDTO);
	})
	.get('/api/slack/connect', (c) => {
		if (!slackIsConfigured(c.env)) return c.json({ error: 'Slack is not set up here.' }, 404);
		const state = randomToken(16);
		setCookie(c, STATE_COOKIE, state, {
			httpOnly: true,
			secure: true,
			sameSite: 'Lax',
			path: STATE_COOKIE_PATH,
			maxAge: STATE_MAX_AGE_SECONDS
		});
		const url = new URL(SLACK_AUTHORIZE_URL);
		url.search = new URLSearchParams({
			client_id: c.env.SLACK_CLIENT_ID ?? '',
			scope: SLACK_BOT_SCOPES.join(','),
			redirect_uri: slackCallbackUrl(c.env),
			state
		}).toString();
		return c.redirect(url.toString());
	})
	.get('/api/slack/callback', async (c) => {
		const settingsUrl = (params: Record<string, string>) =>
			`${c.env.APP_URL}${SETTINGS_PATH}?${new URLSearchParams(params)}`;
		const fail = (message: string) => c.redirect(settingsUrl({ slack_error: message }));
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
		return c.redirect(settingsUrl({ slack: 'connected' }));
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
