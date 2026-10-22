import { overLimit, routes, workspace } from '../app';
import { routeKeysOf, validSignature, webhooksEnabled, type WebhookPayload } from '../webhooks';
import { routedUsers } from '../workspace/routes';

const MAX_BODY_BYTES = 1024 * 1024;

const app = routes().post('/api/github/webhook', async (c) => {
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
