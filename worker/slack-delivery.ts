import type { Env } from './db';
import {
	openDirectMessage,
	postSlackMessage,
	tokenWasRevoked,
	userIsGone,
	type SlackMessage
} from './slack';
import {
	removeSlackConnection,
	removeSlackWorkspace,
	saveDirectMessageChannel,
	slackConnectionWithToken
} from './slack-store';

export type SlackDelivery =
	| { sent: true }
	| { sent: false; reason: 'not-connected' | 'revoked' | 'user-gone' | 'failed'; error?: string };

export async function sendSlackDirectMessage(
	env: Env,
	userId: number,
	message: SlackMessage
): Promise<SlackDelivery> {
	const connection = await slackConnectionWithToken(env, userId);
	if (!connection) return { sent: false, reason: 'not-connected' };
	const failure = async (error: string): Promise<SlackDelivery> => {
		if (tokenWasRevoked(error)) {
			await removeSlackWorkspace(env, connection.teamId);
			return { sent: false, reason: 'revoked', error };
		}
		if (userIsGone(error)) {
			await removeSlackConnection(env, userId);
			return { sent: false, reason: 'user-gone', error };
		}
		return { sent: false, reason: 'failed', error };
	};

	let channelId = connection.dmChannelId;
	if (!channelId) {
		const opened = await openDirectMessage(connection.botToken, connection.slackUserId);
		if (!opened.ok) return failure(opened.error);
		channelId = opened.channelId;
		await saveDirectMessageChannel(env, userId, channelId);
	}
	const posted = await postSlackMessage(connection.botToken, channelId, message);
	return posted.ok ? { sent: true } : failure(posted.error);
}
