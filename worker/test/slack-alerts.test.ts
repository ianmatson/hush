import { afterEach, describe, expect, it, vi } from 'vitest';
import { deliveredByAnyChannel } from '../alert-channels';
import { b64urlEncode, encryptSecret } from '../crypto';
import type { Env } from '../db';
import { sendSlackAlerts, slackAlertOf } from '../slack-alerts';

const TEAM_ID = 'T1';
const USER_ID = 7;
const ALERT = { title: 'Review requested', body: 'acme/api#12', url: 'https://hush.test/v/mine' };

type Statement = { sql: string; args: unknown[] };

async function fakeSlackEnv() {
	const key = b64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
	const { ct, iv } = await encryptSecret('xoxb-test', key, `slack:${TEAM_ID}:bot_token`);
	const connectionRow = {
		team_id: TEAM_ID,
		team_name: 'Acme',
		slack_user_id: 'U1',
		dm_channel_id: 'D1',
		connected_at: 0,
		bot_token_ct: ct,
		bot_token_iv: iv
	};
	const written: Statement[] = [];
	const prepare = (sql: string) => {
		const statement: Statement = { sql, args: [] };
		const prepared = {
			statement,
			bind: (...args: unknown[]) => ((statement.args = args), prepared),
			first: async () => (sql.includes('FROM slack_connections c JOIN') ? connectionRow : null),
			all: async () => ({ results: [{ user_id: USER_ID }] }),
			run: async () => (written.push(statement), {})
		};
		return prepared;
	};
	const batch = async (list: { statement: Statement }[]) =>
		written.push(...list.map((p) => p.statement));
	return { env: { DB: { prepare, batch }, TOKEN_ENC_KEY: key } as unknown as Env, written };
}

function slackAnswers(...answers: object[]) {
	const fetch = vi.fn();
	for (const answer of answers) fetch.mockResolvedValueOnce(Response.json(answer));
	vi.stubGlobal('fetch', fetch);
	return fetch;
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('slackAlertOf', () => {
	it('has the title, the body, and an Open in Hush button', () => {
		const message = slackAlertOf(ALERT);
		expect(message.text).toBe('Review requested: acme/api#12');
		expect(message.blocks).toEqual([
			{ type: 'section', text: { type: 'mrkdwn', text: '*Review requested*\nacme/api#12' } },
			{
				type: 'actions',
				elements: [
					{
						type: 'button',
						text: { type: 'plain_text', text: 'Open in Hush' },
						url: 'https://hush.test/v/mine'
					}
				]
			}
		]);
	});

	it('lists the items of a digest', () => {
		const message = slackAlertOf({
			...ALERT,
			title: '3 things need you',
			body: 'a\nb\nc',
			tag: 'digest'
		});
		expect(message.blocks?.[0]).toEqual({
			type: 'section',
			text: { type: 'mrkdwn', text: '*3 things need you*\n• a\n• b\n• c' }
		});
	});

	it('escapes Slack control characters', () => {
		const message = slackAlertOf({ ...ALERT, title: 'Fix <a> & <!channel>' });
		expect(JSON.stringify(message.blocks)).toContain('Fix &lt;a&gt; &amp; &lt;!channel&gt;');
	});

	it('leaves out the button for a link that is not absolute', () => {
		expect(slackAlertOf({ ...ALERT, url: '/v/mine' }).blocks).toHaveLength(1);
	});
});

describe('sendSlackAlerts', () => {
	it('sends each alert as a direct message', async () => {
		const { env } = await fakeSlackEnv();
		const fetch = slackAnswers({ ok: true, ts: '1' }, { ok: true, ts: '2' });
		expect(await sendSlackAlerts(env, USER_ID, [ALERT, ALERT])).toBe(true);
		expect(fetch).toHaveBeenCalledTimes(2);
		const [url, init] = fetch.mock.calls[0];
		expect(url).toBe('https://slack.com/api/chat.postMessage');
		expect(JSON.parse(init.body).channel).toBe('D1');
	});

	it('removes the workspace and stops on a revoked token', async () => {
		const { env, written } = await fakeSlackEnv();
		const fetch = slackAnswers({ ok: false, error: 'token_revoked' });
		vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await sendSlackAlerts(env, USER_ID, [ALERT, ALERT])).toBe(false);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(written.map((s) => s.sql)).toEqual([
			'DELETE FROM slack_connections WHERE team_id = ?',
			'DELETE FROM slack_workspaces WHERE team_id = ?'
		]);
	});

	it('tries the next alert after a failure that is not about the connection', async () => {
		const { env } = await fakeSlackEnv();
		slackAnswers({ ok: false, error: 'ratelimited' }, { ok: true, ts: '2' });
		vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await sendSlackAlerts(env, USER_ID, [ALERT, ALERT])).toBe(true);
	});
});

describe('deliveredByAnyChannel', () => {
	it('counts as delivered when push works and Slack fails', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const slackFails = () => Promise.reject(new Error('network'));
		const pushWorks = () => Promise.resolve(true);
		expect(await deliveredByAnyChannel([pushWorks, slackFails])).toBe(true);
	});

	it('is not delivered when no channel accepted', async () => {
		expect(await deliveredByAnyChannel([async () => false, async () => false])).toBe(false);
		expect(await deliveredByAnyChannel([])).toBe(false);
	});
});
