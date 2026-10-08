import { projectAccessOf, type ProjectEdit } from '../../src/lib/shared/projects';
import { userToken } from '../db';
import { editProject, projectsOf } from '../projects';
import { routes, poller, json } from '../app';

const NAME = /^(?!\.+$)[A-Za-z0-9_.-]{1,100}$/;
const NODE_ID = /^[A-Za-z0-9_=-]{1,120}$/;
const isNodeId = (v: unknown): v is string => typeof v === 'string' && NODE_ID.test(v);

function validEdit(b: Partial<ProjectEdit> & Record<string, unknown>): ProjectEdit | null {
	if (!isNodeId(b.projectId) || !isNodeId(b.itemId)) return null;
	const at = { projectId: b.projectId, itemId: b.itemId };
	switch (b.action) {
		case 'status':
			if (!isNodeId(b.fieldId) || !(b.optionId === null || typeof b.optionId === 'string'))
				return null;
			if (typeof b.optionId === 'string' && !/^[\w-]{1,40}$/.test(b.optionId)) return null;
			return { action: 'status', ...at, fieldId: b.fieldId, optionId: b.optionId };
		case 'remove':
			return { action: 'remove', ...at };
		case 'move':
			if (!isNodeId(b.toProjectId) || !isNodeId(b.contentId)) return null;
			return { action: 'move', ...at, toProjectId: b.toProjectId, contentId: b.contentId };
		default:
			return null;
	}
}

const app = routes()
	.get('/api/projects/:owner/:repo/:number', async (c) => {
		const u = c.get('user');
		const { owner, repo } = c.req.param();
		const number = Number(c.req.param('number'));
		if (!NAME.test(owner) || !NAME.test(repo) || !Number.isInteger(number) || number < 1)
			return c.json({ error: 'Not a PR or issue.' }, 400);
		const access = projectAccessOf(u.scopes ? u.scopes.split(',') : []);
		try {
			return c.json(await projectsOf(await userToken(c.env, u), access, owner, repo, number), 200, {
				'Cache-Control': 'private, no-store'
			});
		} catch (err) {
			return c.json({ error: (err as Error).message }, 502);
		}
	})
	.post('/api/projects/item', json<ProjectEdit>(), async (c) => {
		if (c.env.GITHUB_WRITES === 'off')
			return c.json({ error: 'GitHub writes are off in this copy (GITHUB_WRITES=off).' }, 403);
		const u = c.get('user');
		if (projectAccessOf(u.scopes ? u.scopes.split(',') : []) !== 'edit')
			return c.json({ error: 'Give Hush project access first.' }, 403);
		const edit = validEdit(c.req.valid('json') as Record<string, unknown>);
		if (!edit) return c.json({ error: 'Not a project change.' }, 400);
		const error = await editProject(await userToken(c.env, u), edit);
		if (error) return c.json({ error }, 422);
		c.executionCtx.waitUntil(
			poller(c.env, u.id)
				.rebuildBoards()
				.catch((err) => console.error('board rebuild failed', (err as Error).message))
		);
		return c.json({ ok: true as const });
	});

export default app;
