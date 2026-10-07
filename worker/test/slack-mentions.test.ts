import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	extractAround,
	githubOrgMembership,
	mentionPattern,
	mentionQuery,
	mentionsInstallFrom,
	membershipByAnyToken,
	mentionsOf,
	plainSlackText,
	searchMentions
} from '../slack-mentions';

const POSTHOG_TEAM = 'TSS5W8YQZ';
const REF = { owner: 'PostHog', repo: 'posthog', number: 123, kind: 'pr' as const };

afterEach(() => vi.unstubAllGlobals());

describe('mentionsInstallFrom', () => {
	const answer = {
		ok: true as const,
		team: { id: POSTHOG_TEAM },
		authed_user: { id: 'U1', access_token: 'xoxp-1', token_type: 'user' }
	};

	it('accepts a user token from the PostHog workspace', () => {
		expect(mentionsInstallFrom(answer, POSTHOG_TEAM)).toEqual({
			slackUserId: 'U1',
			userToken: 'xoxp-1'
		});
	});

	it('refuses any other workspace', () => {
		expect(mentionsInstallFrom({ ...answer, team: { id: 'T_OTHER' } }, POSTHOG_TEAM)).toEqual({
			error: 'Slack mentions work only in the PostHog Slack workspace.'
		});
		expect(mentionsInstallFrom({ ...answer, team: null }, POSTHOG_TEAM)).toHaveProperty('error');
	});

	it('refuses an answer with no user token', () => {
		const botOnly = { ...answer, authed_user: { id: 'U1' } };
		expect(mentionsInstallFrom(botOnly, POSTHOG_TEAM)).toHaveProperty('error');
	});

	it('reports a Slack error', () => {
		expect(mentionsInstallFrom({ ok: false, error: 'invalid_code' }, POSTHOG_TEAM)).toEqual({
			error: 'Slack did not connect (invalid_code).'
		});
	});
});

describe('mentionPattern', () => {
	const pattern = mentionPattern(REF);

	it('finds PR and issue links and the short form', () => {
		expect(pattern.test('see https://github.com/PostHog/posthog/pull/123 pls')).toBe(true);
		expect(pattern.test('<https://github.com/posthog/posthog/issues/123|#123>')).toBe(true);
		expect(pattern.test('fixed in PostHog/posthog#123.')).toBe(true);
	});

	it('does not find another number, repo, or a longer number', () => {
		expect(pattern.test('PostHog/posthog#1234')).toBe(false);
		expect(pattern.test('PostHog/posthog#12')).toBe(false);
		expect(pattern.test('PostHog/posthog-js#123')).toBe(false);
		expect(pattern.test('github.com/PostHog/posthog/pull/124')).toBe(false);
	});

	it('treats dots in names as text', () => {
		const dotted = mentionPattern({ owner: 'a.b', repo: 'c', number: 1 });
		expect(dotted.test('aXb/c#1')).toBe(false);
		expect(dotted.test('a.b/c#1')).toBe(true);
	});
});

describe('mentionQuery', () => {
	it('asks for the quoted GitHub URL, because Slack search returns nothing for OR', () => {
		expect(mentionQuery(REF)).toBe('"https://github.com/PostHog/posthog/pull/123"');
		expect(mentionQuery({ ...REF, kind: 'issue' })).toBe(
			'"https://github.com/PostHog/posthog/issues/123"'
		);
	});
});

describe('plainSlackText', () => {
	it('shows links, mentions, and channels as Slack shows them', () => {
		expect(
			plainSlackText(
				'<@U1|ana> shipped <https://github.com/PostHog/posthog/pull/123|Cross-project insights> in <#C1|team-replay>, see <https://posthog.com> cc <!here> &lt;3 &amp; <@U2>'
			)
		).toBe(
			'@ana shipped Cross-project insights in #team-replay, see https://posthog.com cc @here <3 & @someone'
		);
	});
});

describe('extractAround', () => {
	it('keeps a short message whole, on one line', () => {
		expect(extractAround('ship\n PostHog/posthog#123  today', mentionPattern(REF))).toBe(
			'ship PostHog/posthog#123 today'
		);
	});

	it('cuts a long message around the link', () => {
		const long = `${'a '.repeat(200)}PostHog/posthog#123${' b'.repeat(200)}`;
		const extract = extractAround(long, mentionPattern(REF));
		expect(extract.startsWith('…')).toBe(true);
		expect(extract.endsWith('…')).toBe(true);
		expect(extract).toContain('PostHog/posthog#123');
		expect(extract.length).toBeLessThan(260);
	});
});

describe('mentionsOf', () => {
	const message = {
		author_name: 'Ana',
		channel_name: 'team-replay',
		message_ts: '1800000000.000100',
		content: 'can someone review PostHog/posthog#123',
		permalink: 'https://posthog.slack.com/archives/C1/p1800000000000100'
	};

	it('keeps only messages that link to the item, newest first', () => {
		const older = { ...message, message_ts: '1700000000.000000', permalink: 'https://x/1' };
		const other = { ...message, content: 'PostHog/posthog#999', permalink: 'https://x/2' };
		const mentions = mentionsOf([older, other, message], REF);
		expect(mentions.map((m) => m.permalink)).toEqual([message.permalink, older.permalink]);
		expect(mentions[0]).toEqual({
			channelName: 'team-replay',
			authorName: 'Ana',
			at: 1_800_000_000_000,
			extract: 'can someone review PostHog/posthog#123',
			permalink: message.permalink
		});
	});

	it('drops a message with no permalink or time', () => {
		expect(mentionsOf([{ ...message, permalink: undefined }], REF)).toEqual([]);
		expect(mentionsOf([{ ...message, message_ts: undefined }], REF)).toEqual([]);
	});
});

describe('searchMentions', () => {
	it('searches all channel types by keyword, newest first', async () => {
		const fetch = vi.fn().mockResolvedValue(
			Response.json({
				ok: true,
				results: {
					messages: [
						{
							author_name: 'Ana',
							channel_name: 'general',
							message_ts: '1800000000.0',
							content: 'PostHog/posthog#123',
							permalink: 'https://posthog.slack.com/p1'
						}
					]
				}
			})
		);
		vi.stubGlobal('fetch', fetch);
		const found = await searchMentions('xoxp-1', REF);
		expect(found).toMatchObject({ ok: true, mentions: [{ authorName: 'Ana' }] });
		const [url, init] = fetch.mock.calls[0];
		expect(url).toBe('https://slack.com/api/assistant.search.context');
		expect(init.headers.Authorization).toBe('Bearer xoxp-1');
		const body = new URLSearchParams(init.body);
		expect(body.get('query')).toBe(mentionQuery(REF));
		expect(body.get('channel_types')).toBe('public_channel,private_channel,mpim,im');
		expect(body.get('disable_semantic_search')).toBe('true');
		expect(body.get('sort')).toBe('timestamp');
	});

	it('passes on a Slack error', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(Response.json({ ok: false, error: 'token_revoked' }))
		);
		expect(await searchMentions('xoxp-1', REF)).toEqual({ ok: false, error: 'token_revoked' });
	});
});

describe('githubOrgMembership', () => {
	const answer = (status: number, body: object = {}) =>
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body, { status })));

	it('is a member only with an active membership', async () => {
		answer(200, { state: 'active' });
		expect(await githubOrgMembership('gho_1', 'PostHog')).toBe('member');
		answer(200, { state: 'pending' });
		expect(await githubOrgMembership('gho_1', 'PostHog')).toBe('not-member');
	});

	it('is not a member on 404', async () => {
		answer(404);
		expect(await githubOrgMembership('gho_1', 'PostHog')).toBe('not-member');
	});

	it('does not know on other errors, such as an org that has not approved Hush', async () => {
		answer(403, { message: 'OAuth App access restrictions' });
		expect(await githubOrgMembership('gho_1', 'PostHog')).toBe('unknown');
	});
});

describe('membershipByAnyToken', () => {
	it('asks with the next token when GitHub hides the membership from the sign-in token', async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({ message: 'OAuth App access restrictions' }, { status: 403 })
			)
			.mockResolvedValueOnce(Response.json({ state: 'active' }));
		vi.stubGlobal('fetch', fetch);
		expect(await membershipByAnyToken(['gho_signin', 'ghp_own'], 'PostHog')).toBe('member');
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('stops at the first clear answer', async () => {
		const fetch = vi.fn().mockResolvedValue(Response.json({}, { status: 404 }));
		vi.stubGlobal('fetch', fetch);
		expect(await membershipByAnyToken(['gho_signin', 'ghp_own'], 'PostHog')).toBe('not-member');
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('does not know when no token gets an answer', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({}, { status: 403 })));
		expect(await membershipByAnyToken(['gho_signin'], 'PostHog')).toBe('unknown');
		expect(await membershipByAnyToken([], 'PostHog')).toBe('unknown');
	});
});
