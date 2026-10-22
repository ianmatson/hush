import type { WebhookAccess, WebhookAccount } from '../../src/lib/shared/types';
import { overLimit, query, routes, workspace } from '../app';
import { appToken, userToken } from '../db';
import { appInstallations, forgetInstallations, type AppInstallation } from '../github-app';
import { gh } from '../github';
import { routeKeysOf, validSignature, webhooksEnabled, type WebhookPayload } from '../webhooks';
import { routedUsers } from '../workspace/routes';

const MAX_BODY_BYTES = 1024 * 1024;

function accountRow(
	slug: string,
	account: { login: string; id: number; kind: WebhookAccount['kind'] },
	installation: AppInstallation | undefined
): WebhookAccount {
	const manage =
		account.kind === 'org'
			? `https://github.com/organizations/${account.login}/settings/installations/${installation?.id}`
			: `https://github.com/settings/installations/${installation?.id}`;
	return {
		login: account.login,
		kind: account.kind,
		state: !installation ? 'missing' : installation.suspended ? 'suspended' : 'installed',
		selection: installation?.selection ?? null,
		url: installation
			? manage
			: `https://github.com/apps/${slug}/installations/new/permissions?target_id=${account.id}`
	};
}

const app = routes()
	.get('/api/account/webhooks', query<{ refresh: '1' }>(), async (c) => {
		if (!webhooksEnabled(c.env) || !c.env.GITHUB_APP_SLUG)
			return c.json({ available: false } satisfies WebhookAccess);
		if (c.req.query('refresh') === '1') forgetInstallations();
		const user = c.get('user');
		const token = (await appToken(c.env, user)) ?? (await userToken(c.env, user));
		const [orgsRes, installations] = await Promise.all([
			gh(token, '/user/orgs?per_page=100'),
			appInstallations(c.env)
		]);
		if (!orgsRes.ok)
			return c.json({ error: `GitHub returned ${orgsRes.status} for your orgs.` }, 502);
		const orgs = (await orgsRes.json()) as { login: string; id: number }[];
		const accounts = [
			{ login: user.login, id: user.id, kind: 'user' as const },
			...orgs.map((org) => ({ login: org.login, id: org.id, kind: 'org' as const }))
		];
		const byAccount = new Map(installations.map((i) => [i.accountId, i]));
		return c.json({
			available: true,
			accounts: accounts.map((account) =>
				accountRow(c.env.GITHUB_APP_SLUG!, account, byAccount.get(account.id))
			)
		} satisfies WebhookAccess);
	})
	.post('/api/github/webhook', async (c) => {
		if (!webhooksEnabled(c.env)) return c.json({ error: 'Not found' }, 404);
		if (Number(c.req.header('Content-Length') ?? 0) > MAX_BODY_BYTES)
			return c.json({ error: 'Too large' }, 413);
		const body = await c.req.arrayBuffer();
		if (body.byteLength > MAX_BODY_BYTES) return c.json({ error: 'Too large' }, 413);
		const signature = c.req.header('X-Hub-Signature-256');
		if (!(await validSignature(c.env.GITHUB_WEBHOOK_SECRET!, body, signature)))
			return c.json({ error: 'Bad signature' }, 401);
		let payload: WebhookPayload;
		try {
			payload = JSON.parse(new TextDecoder().decode(body));
		} catch {
			return c.json({ error: 'Bad payload' }, 400);
		}
		const event = c.req.header('X-GitHub-Event') ?? '';
		const routeKeys = routeKeysOf(event, payload);
		const users = routeKeys.length ? await routedUsers(c.env.DB, routeKeys) : new Map();
		const outcomes = await Promise.allSettled(
			[...users].map(async ([userId, userRoutes]) => {
				if (await overLimit(c.env.WEBHOOK_LIMIT, `webhook:${userId}`)) return 'limited';
				await workspace(c.env, userId).invalidate(userRoutes);
				return 'sent';
			})
		);
		const failed = outcomes.filter((outcome) => outcome.status === 'rejected').length;
		console.log(
			JSON.stringify({
				webhook: event,
				action: payload.action ?? null,
				installation: payload.installation?.id ?? null,
				routes: routeKeys.length,
				users: users.size,
				limited: outcomes.filter((o) => o.status === 'fulfilled' && o.value === 'limited').length,
				failed
			})
		);
		return failed ? c.json({ error: 'Some workspaces did not answer' }, 502) : c.body(null, 202);
	});

export default app;
