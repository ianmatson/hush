import type { Snapshot } from '../../src/lib/shared/changes';
import { routes, workspace, json } from '../app';
import type { SeenMark } from '../workspace/object';

const MAX_MARKS = 50;
const MAX_ID_CHARS = 100;

const validId = (id: unknown): id is string =>
	typeof id === 'string' && id.length > 0 && id.length <= MAX_ID_CHARS;

function seenMarksOf(marks: unknown): SeenMark[] | null {
	if (!Array.isArray(marks) || marks.length > MAX_MARKS) return null;
	const valid = marks.every(
		(mark) =>
			validId(mark?.itemId) &&
			Number.isInteger(mark.revision) &&
			typeof mark.baseline === 'object' &&
			mark.baseline !== null &&
			JSON.stringify(mark.baseline).length < 4096
	);
	return valid ? (marks as { itemId: string; revision: number; baseline: Snapshot }[]) : null;
}

const app = routes()
	.post('/api/seen', json<{ marks: SeenMark[] }>(), async (c) => {
		const marks = seenMarksOf(c.req.valid('json').marks);
		if (!marks) return c.json({ error: 'Which items?' }, 400);
		return c.json(await workspace(c.env, c.get('user').id).markSeen(marks));
	})
	.post('/api/unseen', json<{ ids: string[] }>(), async (c) => {
		const ids = c.req.valid('json').ids;
		if (!Array.isArray(ids) || !ids.every(validId)) return c.json({ error: 'Which items?' }, 400);
		return c.json(await workspace(c.env, c.get('user').id).markUnseen(ids.slice(0, MAX_MARKS)));
	})
	.post('/api/sync', async (c) => c.json(await workspace(c.env, c.get('user').id).pollNow()));

export default app;
