import {
	FIELD_SEARCH_MAX,
	isItemField,
	validItemFieldChanges,
	type ItemFieldEdit
} from '../../src/lib/shared/item-fields';
import { isGitHubName, parseRepoFullName } from '../../src/lib/shared/item-page';
import { userToken } from '../db';
import { GitHubError } from '../github';
import { assignableUsers, editItemField, repoLabels } from '../item-fields';
import { json, query, routes, type Ctx } from '../app';
import { refreshWrittenSubject } from '../subject-writes';
import { writeBlockForRepo } from '../write-gate';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

function searchTarget(c: Ctx) {
	const { owner, repo } = c.req.param();
	const search = (c.req.query('q') ?? '').trim();
	if (!isGitHubName(owner) || !isGitHubName(repo)) return { error: 'Not a repository.' } as const;
	if (search.length > FIELD_SEARCH_MAX) return { error: 'Too long.' } as const;
	return { owner, repo, search } as const;
}

const app = routes()
	.get('/api/item-fields/:owner/:repo/labels', query<{ q: string }>(), async (c) => {
		const target = searchTarget(c);
		if ('error' in target) return c.json({ error: target.error }, 400);
		try {
			const token = await userToken(c.env, c.get('user'));
			const labels = await repoLabels(token, target.owner, target.repo, target.search);
			return c.json({ labels }, 200, NO_STORE);
		} catch (err) {
			if (err instanceof GitHubError) return c.json({ error: err.message }, 502);
			throw err;
		}
	})
	.get('/api/item-fields/:owner/:repo/assignees', query<{ q: string }>(), async (c) => {
		const target = searchTarget(c);
		if ('error' in target) return c.json({ error: target.error }, 400);
		try {
			const token = await userToken(c.env, c.get('user'));
			const users = await assignableUsers(token, target.owner, target.repo, target.search);
			return c.json({ users }, 200, NO_STORE);
		} catch (err) {
			if (err instanceof GitHubError) return c.json({ error: err.message }, 502);
			throw err;
		}
	})
	.post('/api/item-fields', json<ItemFieldEdit>(), async (c) => {
		const b = c.req.valid('json');
		const target = parseRepoFullName(b.repo);
		if (!target) return c.json({ error: 'Not a repository.' }, 400);
		const number = Number(b.number);
		if (!Number.isInteger(number) || number < 1)
			return c.json({ error: 'Not a PR or issue.' }, 400);
		if (!isItemField(b.field)) return c.json({ error: 'Unknown field.' }, 400);
		const change = validItemFieldChanges(b.field, b.add, b.remove);
		if (!change) return c.json({ error: 'Not a change.' }, 400);
		const repo = `${target.owner}/${target.name}`;
		const blocked = writeBlockForRepo(c.env, repo);
		if (blocked) return c.json({ error: blocked }, 403);
		const token = await userToken(c.env, c.get('user'));
		const failure = await editItemField(token, repo, number, b.field, change);
		if (failure) return c.json({ error: failure.error }, failure.status);
		refreshWrittenSubject(c, { repo, number });
		return c.json({ ok: true as const });
	});

export default app;
