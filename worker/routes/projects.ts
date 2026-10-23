import { projectAccessOf, type ProjectEdit } from '../../src/lib/shared/projects';
import { isGitHubName, isNodeId } from '../../src/lib/shared/item-page';
import { scopesOf, userToken } from '../db';
import { editProject, projectsOf } from '../projects';
import { routes, workspace, json } from '../app';
import { writeBlockForProjects } from '../write-gate';

function validEdit(b: Partial<ProjectEdit> & Record<string, unknown>): ProjectEdit | null {
	if (b.action === 'add')
		return isNodeId(b.projectId) && isNodeId(b.contentId)
			? { action: 'add', projectId: b.projectId, contentId: b.contentId }
			: null;
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
		if (!isGitHubName(owner) || !isGitHubName(repo) || !Number.isInteger(number) || number < 1)
			return c.json({ error: 'Not a PR or issue.' }, 400);
		const access = projectAccessOf(scopesOf(u));
		try {
			return c.json(await projectsOf(await userToken(c.env, u), access, owner, repo, number), 200, {
				'Cache-Control': 'private, no-store'
			});
		} catch (err) {
			return c.json({ error: (err as Error).message }, 502);
		}
	})
	.post('/api/projects/item', json<ProjectEdit>(), async (c) => {
		const blocked = writeBlockForProjects(c.env);
		if (blocked) return c.json({ error: blocked }, 403);
		const u = c.get('user');
		if (projectAccessOf(scopesOf(u)) !== 'edit')
			return c.json({ error: 'Give Hush project access first.' }, 403);
		const edit = validEdit(c.req.valid('json') as Record<string, unknown>);
		if (!edit) return c.json({ error: 'Not a project change.' }, 400);
		const error = await editProject(await userToken(c.env, u), edit);
		if (error) return c.json({ error }, 422);
		c.executionCtx.waitUntil(
			workspace(c.env, u.id)
				.rebuildBoards()
				.catch((err) => console.error('board rebuild failed', (err as Error).message))
		);
		return c.json({ ok: true as const });
	});

export default app;
