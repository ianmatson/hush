import { itemPagePathFromGitHubUrl } from '../src/lib/shared/item-page';
import type { Env } from './db';
import type { SlackMessage } from './slack';
import { sendSlackDirectMessage } from './slack-delivery';
import type { PushMessage } from './webpush';

const DIGEST_TAG = 'digest';
const OPEN_BUTTON_LABEL = 'Open in Hush';
const SECTION_TEXT_MAX = 3000;

const escapeSlackText = (text: string) =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const isAbsoluteUrl = (url: string) => /^https?:\/\//.test(url);

const bulletList = (lines: string[]) => lines.map((line) => `• ${line}`).join('\n');

function bodyText(alert: PushMessage): string {
	const lines = alert.body.split('\n').filter((line) => line.trim());
	const escaped = lines.map(escapeSlackText);
	return alert.tag === DIGEST_TAG ? bulletList(escaped) : escaped.join('\n');
}

function openInHushUrl(alertUrl: string, origin: string): string {
	const itemPath = itemPagePathFromGitHubUrl(alertUrl);
	return itemPath ? `${origin}${itemPath}` : alertUrl;
}

export function slackAlertOf(alert: PushMessage, origin: string): SlackMessage {
	const body = bodyText(alert);
	const heading = `*${escapeSlackText(alert.title)}*`;
	const sectionText = (body ? `${heading}\n${body}` : heading).slice(0, SECTION_TEXT_MAX);
	const section = { type: 'section', text: { type: 'mrkdwn', text: sectionText } };
	const openUrl = openInHushUrl(alert.url, origin);
	const openButton = {
		type: 'actions',
		elements: [
			{ type: 'button', text: { type: 'plain_text', text: OPEN_BUTTON_LABEL }, url: openUrl }
		]
	};
	return {
		text: alert.body ? `${alert.title}: ${alert.body.split('\n')[0]}` : alert.title,
		blocks: isAbsoluteUrl(openUrl) ? [section, openButton] : [section]
	};
}

export async function sendSlackAlerts(
	env: Env,
	userId: number,
	alerts: PushMessage[],
	origin: string
): Promise<boolean> {
	let delivered = false;
	for (const alert of alerts) {
		const delivery = await sendSlackDirectMessage(env, userId, slackAlertOf(alert, origin));
		if (delivery.sent) delivered = true;
		else if (delivery.reason === 'failed') console.error('slack alert failed', delivery.error);
		else break;
	}
	return delivered;
}
