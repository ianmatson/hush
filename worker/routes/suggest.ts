import { parseRepoFullName } from '../../src/lib/shared/item-page';
import { userToken } from '../db';
import { GitHubError } from '../github';
import { suggestRefs, suggestUsers } from '../suggest';
import { routes } from '../app';

const app = routes().get('/api/suggest', async (c) => {
	const { repo = '', kind, q = '', from } = c.req.query();
	const target = parseRepoFullName(repo);
	if (!target) return c.json({ error: 'Not a repository.' }, 400);
	const { owner, name } = target;
	if (kind !== 'user' && kind !== 'ref') return c.json({ error: 'Unknown kind.' }, 400);
	if (q.length > 100) return c.json({ error: 'Too long.' }, 400);
	const token = await userToken(c.env, c.get('user'));
	try {
		const items =
			kind === 'user'
				? await suggestUsers(token, owner, name, q)
				: await suggestRefs(token, owner, name, q, !!from && from !== repo);
		return c.json({ items });
	} catch (err) {
		if (err instanceof GitHubError) return c.json({ error: err.message }, 502);
		throw err;
	}
});

export default app;
