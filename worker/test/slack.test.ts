import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { installFrom, slackEventOutcome, slackSignatureIsValid } from '../slack';

const SECRET = '8f742231b10e8888abcd99yyyzzz85a5';
const NOW = 1_800_000_000;

function sign(body: string, timestamp: number, secret = SECRET) {
	const mac = createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex');
	return { timestamp: String(timestamp), signature: `v0=${mac}`, body };
}

describe('slackSignatureIsValid', () => {
	const body = 'token=x&team_id=T1&event=app_uninstalled';

	it('accepts a request that Slack signed', async () => {
		expect(await slackSignatureIsValid(SECRET, sign(body, NOW), NOW)).toBe(true);
	});

	it('refuses a changed body', async () => {
		const signed = sign(body, NOW);
		expect(await slackSignatureIsValid(SECRET, { ...signed, body: `${body}&x=1` }, NOW)).toBe(
			false
		);
	});

	it('refuses another secret', async () => {
		expect(await slackSignatureIsValid(SECRET, sign(body, NOW, 'other'), NOW)).toBe(false);
	});

	it('refuses a request older than five minutes, against replays', async () => {
		expect(await slackSignatureIsValid(SECRET, sign(body, NOW - 301), NOW)).toBe(false);
		expect(await slackSignatureIsValid(SECRET, sign(body, NOW - 299), NOW)).toBe(true);
	});

	it('refuses missing headers and an empty secret', async () => {
		const signed = sign(body, NOW);
		expect(await slackSignatureIsValid(SECRET, { ...signed, signature: undefined }, NOW)).toBe(
			false
		);
		expect(await slackSignatureIsValid(SECRET, { ...signed, timestamp: 'abc' }, NOW)).toBe(false);
		expect(await slackSignatureIsValid('', signed, NOW)).toBe(false);
	});
});

describe('slackEventOutcome', () => {
	it('answers the URL check', () => {
		expect(slackEventOutcome({ type: 'url_verification', challenge: 'abc' })).toEqual({
			kind: 'challenge',
			challenge: 'abc'
		});
	});

	it('removes the workspace when the app is uninstalled', () => {
		expect(
			slackEventOutcome({
				type: 'event_callback',
				team_id: 'T1',
				event: { type: 'app_uninstalled' }
			})
		).toEqual({ kind: 'workspace-removed', teamId: 'T1' });
	});

	it('removes the workspace when its bot token is revoked, not for user tokens only', () => {
		const revoked = (tokens: { bot?: string[]; oauth?: string[] }) =>
			slackEventOutcome({
				type: 'event_callback',
				team_id: 'T1',
				event: { type: 'tokens_revoked', tokens }
			});
		expect(revoked({ bot: ['B1'] })).toEqual({ kind: 'workspace-removed', teamId: 'T1' });
		expect(revoked({ oauth: ['U1'] })).toEqual({ kind: 'ignored' });
	});

	it('ignores other events', () => {
		expect(
			slackEventOutcome({ type: 'event_callback', team_id: 'T1', event: { type: 'message' } })
		).toEqual({ kind: 'ignored' });
	});
});

describe('installFrom', () => {
	const answer = {
		ok: true as const,
		access_token: 'xoxb-1',
		token_type: 'bot',
		bot_user_id: 'B1',
		team: { id: 'T1', name: 'Acme' },
		authed_user: { id: 'U1' }
	};

	it('reads a workspace install', () => {
		expect(installFrom(answer)).toEqual({
			teamId: 'T1',
			teamName: 'Acme',
			botUserId: 'B1',
			botToken: 'xoxb-1',
			slackUserId: 'U1'
		});
	});

	it('refuses an org-wide Enterprise Grid install', () => {
		expect(installFrom({ ...answer, team: null, is_enterprise_install: true })).toHaveProperty(
			'error'
		);
	});

	it('reports a Slack error', () => {
		expect(installFrom({ ok: false, error: 'invalid_code' })).toEqual({
			error: 'Slack did not connect (invalid_code).'
		});
	});

	it('refuses an answer with no bot token', () => {
		expect(installFrom({ ...answer, access_token: undefined })).toHaveProperty('error');
	});
});
