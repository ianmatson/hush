import { MINUTE_MS } from '../src/lib/shared/durations';
import type { Env } from './db';
import { gh } from './github';

export const INSTALLATIONS_TTL_MS = 5 * MINUTE_MS;
const JWT_LIFETIME_S = 9 * 60;
const CLOCK_SKEW_S = 60;

export interface AppInstallation {
	id: number;
	accountId: number;
	suspended: boolean;
	selection: 'all' | 'selected';
}

let cached: { at: number; installations: AppInstallation[] } | null = null;

const base64url = (bytes: Uint8Array) =>
	btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');

const jsonPart = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));

function derOf(pem: string): Uint8Array {
	const body = pem
		.replace(/\\n/g, '\n')
		.replace(/-----[A-Z ]+-----/g, '')
		.replace(/\s+/g, '');
	return Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
}

export async function appJwt(env: Env, now = Date.now()): Promise<string> {
	const key = await crypto.subtle.importKey(
		'pkcs8',
		derOf(env.GITHUB_APP_PRIVATE_KEY!),
		{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
		false,
		['sign']
	);
	const iat = Math.floor(now / 1000) - CLOCK_SKEW_S;
	const data = `${jsonPart({ alg: 'RS256', typ: 'JWT' })}.${jsonPart({
		iat,
		exp: iat + JWT_LIFETIME_S,
		iss: env.GITHUB_APP_ID
	})}`;
	const signature = await crypto.subtle.sign(
		'RSASSA-PKCS1-v1_5',
		key,
		new TextEncoder().encode(data)
	);
	return `${data}.${base64url(new Uint8Array(signature))}`;
}

type InstallationRow = {
	id: number;
	account: { id: number };
	suspended_at: string | null;
	repository_selection: 'all' | 'selected';
};

export async function appInstallations(env: Env, now = Date.now()): Promise<AppInstallation[]> {
	if (cached && now - cached.at < INSTALLATIONS_TTL_MS) return cached.installations;
	const res = await gh(await appJwt(env, now), '/app/installations?per_page=100');
	if (!res.ok) throw new Error(`GitHub returned ${res.status} for the app installations.`);
	const installations = ((await res.json()) as InstallationRow[]).map((row) => ({
		id: row.id,
		accountId: row.account.id,
		suspended: row.suspended_at !== null,
		selection: row.repository_selection
	}));
	cached = { at: now, installations };
	return installations;
}

export function forgetInstallations() {
	cached = null;
}
