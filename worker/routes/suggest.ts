import { userToken } from '../db';
import { GitHubError } from '../github';
import { suggestRefs, suggestUsers } from '../suggest';
import { routes } from '../app';

// GitHub owner or repo name. Names of only dots ("..") are not allowed.
const NAME = /^(?!\.+$)[A-Za-z0-9_.-]{1,100}$/;

const app = routes().get('/api/suggest', async (c) => {
	const { repo = '', kind, q = '', from } = c.req.query();
	const [owner, name, extra] = repo.split('/');
	if (!NAME.test(owner ?? '') || !NAME.test(name ?? '') || extra !== undefined)
		return c.json({ error: 'Not a repository.' }, 400);
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
