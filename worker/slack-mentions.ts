import type { SlackMentionDTO } from '../src/lib/shared/types';
import { appToken, userToken, type Env, type UserRow } from './db';
import { gh } from './github';
import { SLACK_API, slackAnswer, type SlackAnswer } from './slack';
import { saveSlackMentionsAccess, slackMentionsCheckedAt } from './slack-store';

export const SLACK_MENTIONS_USER_SCOPES = [
	'search:read.public',
	'search:read.private',
	'search:read.im',
	'search:read.mpim'
];
const SEARCHED_CHANNEL_TYPES = ['public_channel', 'private_channel', 'mpim', 'im'];
const MAX_MENTIONS = 20;
const EXTRACT_RADIUS = 120;
const ELLIPSIS = '…';
const ACCESS_RECHECK_MS = 24 * 60 * 60 * 1000;

export const slackMentionsConfigured = (env: Env) =>
	!!(
		env.SLACK_MENTIONS_CLIENT_ID &&
		env.SLACK_MENTIONS_CLIENT_SECRET &&
		env.SLACK_MENTIONS_TEAM_ID &&
		env.SLACK_MENTIONS_GITHUB_ORG
	);

export const slackMentionsCallbackUrl = (env: Env) => `${env.APP_URL}/api/slack/mentions/callback`;

export type OrgMembership = 'member' | 'not-member' | 'unknown';

export async function githubOrgMembership(token: string, org: string): Promise<OrgMembership> {
	const res = await gh(token, `/user/memberships/orgs/${encodeURIComponent(org)}`);
	if (res.status === 404) return 'not-member';
	if (res.status !== 200) return 'unknown';
	const membership = (await res.json().catch(() => ({}))) as { state?: string };
	return membership.state === 'active' ? 'member' : 'not-member';
}

export interface SlackMentionsInstall {
	slackUserId: string;
	userToken: string;
}

interface MentionsOAuthAnswer {
	team?: { id: string } | null;
	authed_user?: { id?: string; access_token?: string; token_type?: string };
}

export function mentionsInstallFrom(
	answer: SlackAnswer<MentionsOAuthAnswer>,
	allowedTeamId: string
): SlackMentionsInstall | { error: string } {
	if (!answer.ok) return { error: `Slack did not connect (${answer.error}).` };
	if (answer.team?.id !== allowedTeamId)
		return { error: 'Slack mentions work only in the PostHog Slack workspace.' };
	const user = answer.authed_user;
	if (user?.token_type !== 'user' || !user.access_token || !user.id)
		return { error: 'Slack sent an incomplete answer. Try again.' };
	return { slackUserId: user.id, userToken: user.access_token };
}

export async function exchangeMentionsCode(
	env: Env,
	code: string
): Promise<SlackMentionsInstall | { error: string }> {
	const res = await fetch(`${SLACK_API}/oauth.v2.access`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: env.SLACK_MENTIONS_CLIENT_ID ?? '',
			client_secret: env.SLACK_MENTIONS_CLIENT_SECRET ?? '',
			code,
			redirect_uri: slackMentionsCallbackUrl(env)
		})
	});
	return mentionsInstallFrom(
		await slackAnswer<MentionsOAuthAnswer>(res),
		env.SLACK_MENTIONS_TEAM_ID ?? ''
	);
}

export interface GitHubRef {
	owner: string;
	repo: string;
	number: number;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function mentionQuery({ owner, repo, number }: GitHubRef): string {
	const path = `${owner}/${repo}`;
	return [`"${path}/pull/${number}"`, `"${path}/issues/${number}"`, `"${path}#${number}"`].join(
		' OR '
	);
}

export function mentionPattern({ owner, repo, number }: GitHubRef): RegExp {
	const path = `${escapeRegExp(owner)}/${escapeRegExp(repo)}`;
	return new RegExp(`${path}(?:/(?:pull|issues)/|#)${number}(?![0-9])`, 'i');
}

export function extractAround(content: string, pattern: RegExp): string {
	const text = content.replace(/\s+/g, ' ').trim();
	if (text.length <= EXTRACT_RADIUS * 2) return text;
	const at = pattern.exec(text)?.index ?? 0;
	const start = Math.max(0, at - EXTRACT_RADIUS);
	const end = Math.min(text.length, at + EXTRACT_RADIUS);
	const before = start > 0 ? ELLIPSIS : '';
	const after = end < text.length ? ELLIPSIS : '';
	return `${before}${text.slice(start, end).trim()}${after}`;
}

export interface SearchedMessage {
	author_name?: string;
	channel_name?: string;
	message_ts?: string;
	content?: string;
	permalink?: string;
}

export function mentionsOf(messages: SearchedMessage[], ref: GitHubRef): SlackMentionDTO[] {
	const pattern = mentionPattern(ref);
	const mentions: SlackMentionDTO[] = [];
	for (const m of messages) {
		const content = m.content ?? '';
		if (!pattern.test(content) || !m.permalink || !m.message_ts) continue;
		mentions.push({
			channelName: m.channel_name ?? '',
			authorName: m.author_name ?? '',
			at: Math.round(Number(m.message_ts) * 1000),
			extract: extractAround(content, pattern),
			permalink: m.permalink
		});
	}
	return mentions.sort((a, b) => b.at - a.at).slice(0, MAX_MENTIONS);
}

export async function searchMentions(
	userToken: string,
	ref: GitHubRef
): Promise<SlackAnswer<{ mentions: SlackMentionDTO[] }>> {
	const res = await fetch(`${SLACK_API}/assistant.search.context`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${userToken}`,
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({
			query: mentionQuery(ref),
			channel_types: SEARCHED_CHANNEL_TYPES.join(','),
			content_types: 'messages',
			disable_semantic_search: 'true',
			sort: 'timestamp',
			sort_dir: 'desc',
			limit: String(MAX_MENTIONS)
		})
	});
	const answer = await slackAnswer<{ results?: { messages?: SearchedMessage[] } }>(res);
	if (!answer.ok) return answer;
	return { ok: true, mentions: mentionsOf(answer.results?.messages ?? [], ref) };
}

export async function membershipByAnyToken(tokens: string[], org: string): Promise<OrgMembership> {
	for (const token of tokens) {
		const membership = await githubOrgMembership(token, org);
		if (membership !== 'unknown') return membership;
	}
	return 'unknown';
}

async function githubTokensOf(env: Env, user: UserRow): Promise<string[]> {
	const signIn = await appToken(env, user).catch(() => null);
	const own = user.token_source === 'own' ? await userToken(env, user).catch(() => null) : null;
	return [signIn, own].filter((t): t is string => !!t);
}

export async function refreshSlackMentionsAccess(
	env: Env,
	user: UserRow,
	now = Date.now()
): Promise<void> {
	const org = env.SLACK_MENTIONS_GITHUB_ORG;
	if (!slackMentionsConfigured(env) || !org) return;
	const checkedAt = await slackMentionsCheckedAt(env, user.id);
	if (checkedAt && now - checkedAt < ACCESS_RECHECK_MS) return;
	const membership = await membershipByAnyToken(await githubTokensOf(env, user), org);
	if (membership === 'unknown') return;
	await saveSlackMentionsAccess(env, user.id, membership === 'member');
}
