import type { OrgGap } from '../src/lib/shared/types';
import { gh } from './github';

/**
 * Which of your orgs hide their data from a token, and why. An org that has not approved the
 * OAuth app (or needs SSO authorization) refuses questions about your membership, while the
 * notifications and searches leave it out with no error. One request for the list, then one per
 * org. An error for the list itself is not a gap: the check says nothing then.
 */
export async function orgGaps(token: string): Promise<OrgGap[]> {
	const res = await gh(token, '/user/memberships/orgs?state=active&per_page=100');
	if (!res.ok) return [];
	const orgs = ((await res.json()) as { organization?: { login?: string } }[])
		.map((m) => m.organization?.login)
		.filter((o): o is string => !!o);
	const checks = await Promise.all(
		orgs.map(async (org): Promise<OrgGap | null> => {
			const r = await gh(token, `/user/memberships/orgs/${encodeURIComponent(org)}`);
			if (r.ok || r.status === 404) return null;
			const message = ((await r.json().catch(() => ({}))) as { message?: string }).message ?? '';
			// TEMP (2026-09-27): GitHub's exact answers for a restricted org; remove once confirmed.
			console.log('org access', r.status, message);
			if (/OAuth App access restrictions/i.test(message)) return { org, reason: 'not_approved' };
			if (/SAML|single sign-on|SSO/i.test(message)) return { org, reason: 'sso' };
			return { org, reason: 'other', message: message || `GitHub returned ${r.status}.` };
		})
	);
	return checks.filter((g): g is OrgGap => !!g);
}
