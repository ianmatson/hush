import { gh } from './github';
import type { Env } from './db';

export type Access = { ok: true } | { ok: false; reason: 'not_member' | 'error'; message: string };

export function allowedOrgs(env: Pick<Env, 'ORG_ALLOWLIST'>): string[] {
	return (env.ORG_ALLOWLIST ?? '')
		.split(',')
		.map((o) => o.trim())
		.filter(Boolean);
}

/**
 * Is the token's user an active member of one of the allowed orgs?
 * 404 means "not a member". Other failures (a blocked token type, SAML, rate limits) are errors,
 * so a GitHub problem never counts as proof that someone left the org.
 */
export async function checkAccess(token: string, orgs: string[]): Promise<Access> {
	if (!orgs.length) return { ok: true };
	let error: string | null = null;
	for (const org of orgs) {
		const res = await gh(token, `/user/memberships/orgs/${encodeURIComponent(org)}`);
		if (res.status === 200) {
			const m = (await res.json()) as { state?: string };
			if (m.state === 'active') return { ok: true };
			continue;
		}
		if (res.status === 404) continue;
		const body = (await res.json().catch(() => ({}))) as { message?: string };
		error ??= body.message ?? `GitHub returned ${res.status} for your ${org} membership.`;
	}
	const list = orgs.join(', ');
	return error
		? {
				ok: false,
				reason: 'error',
				message: `Hush could not confirm that you are in ${list}: ${error}`
			}
		: { ok: false, reason: 'not_member', message: `Hush is only open to members of ${list}.` };
}
