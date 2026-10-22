import type { Env } from './db';
import { routeKey } from './workspace/routes';

export const MAX_ROUTES_PER_DELIVERY = 50;

export const webhooksEnabled = (env: Env) => !!env.GITHUB_APP_ID && !!env.GITHUB_WEBHOOK_SECRET;

interface Numbered {
	number?: number;
}

export interface WebhookPayload {
	action?: string;
	installation?: { id?: number };
	repository?: { id?: number };
	pull_request?: Numbered;
	issue?: Numbered;
	check_suite?: { pull_requests?: (Numbered & { base?: { repo?: { id?: number } } })[] };
}

type Located = { repoId: number | undefined; number: number | undefined };

const itemOf =
	(field: 'pull_request' | 'issue') =>
	(payload: WebhookPayload): Located[] => [
		{ repoId: payload.repository?.id, number: payload[field]?.number }
	];

const ITEMS_OF_EVENT: Record<string, (payload: WebhookPayload) => Located[]> = {
	pull_request: itemOf('pull_request'),
	pull_request_review: itemOf('pull_request'),
	pull_request_review_comment: itemOf('pull_request'),
	pull_request_review_thread: itemOf('pull_request'),
	issues: itemOf('issue'),
	issue_comment: itemOf('issue'),
	check_suite: (payload) =>
		payload.action === 'completed'
			? (payload.check_suite?.pull_requests ?? []).map((pr) => ({
					repoId: pr.base?.repo?.id ?? payload.repository?.id,
					number: pr.number
				}))
			: []
};

export function routeKeysOf(event: string, payload: WebhookPayload): string[] {
	const located = ITEMS_OF_EVENT[event]?.(payload) ?? [];
	const keys = located.flatMap(({ repoId, number }) =>
		Number.isInteger(repoId) && Number.isInteger(number) ? [routeKey(repoId!, number!)] : []
	);
	return [...new Set(keys)].slice(0, MAX_ROUTES_PER_DELIVERY);
}

const HEX_SIGNATURE = /^sha256=([0-9a-f]{64})$/i;

export async function validSignature(
	secret: string,
	body: ArrayBuffer,
	header: string | undefined
): Promise<boolean> {
	const hex = header?.match(HEX_SIGNATURE)?.[1];
	if (!hex) return false;
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['verify']
	);
	const signature = Uint8Array.from(hex.match(/../g)!, (byte) => parseInt(byte, 16));
	return crypto.subtle.verify('HMAC', key, signature, body);
}
