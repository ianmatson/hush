import type { Snapshot } from '../../src/lib/shared/changes';
import { routes, workspace, json } from '../app';
import type { SeenMark } from '../workspace/object';

const MAX_MARKS = 50;
const MAX_ID_CHARS = 100;

const validId = (id: unknown): id is string =>
	typeof id === 'string' && id.length > 0 && id.length <= MAX_ID_CHARS;

const CI_STATES = new Set(['SUCCESS', 'FAILURE', 'ERROR', 'PENDING', 'EXPECTED']);
const ITEM_STATES = new Set(['open', 'closed', 'merged']);
const MAX_LABELS = 100;
const MAX_VERDICTS = 100;

const isString = (value: unknown) => typeof value === 'string';
const isCount = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;

function isSnapshot(value: unknown): value is Snapshot {
	if (typeof value !== 'object' || value === null) return false;
	const snapshot = value as Record<string, unknown>;
	const verdicts = snapshot.verdicts;
	return (
		isCount(snapshot.commits) &&
		isCount(snapshot.comments) &&
		(snapshot.ci === null || CI_STATES.has(snapshot.ci as string)) &&
		ITEM_STATES.has(snapshot.state as string) &&
		typeof snapshot.draft === 'boolean' &&
		typeof snapshot.requestedMe === 'boolean' &&
		Array.isArray(snapshot.labels) &&
		snapshot.labels.length <= MAX_LABELS &&
		snapshot.labels.every(isString) &&
		typeof verdicts === 'object' &&
		verdicts !== null &&
		!Array.isArray(verdicts) &&
		Object.keys(verdicts).length <= MAX_VERDICTS &&
		Object.values(verdicts).every(isString)
	);
}

function seenMarksOf(marks: unknown): SeenMark[] | null {
	if (!Array.isArray(marks) || marks.length > MAX_MARKS) return null;
	const valid = marks.every(
		(mark) => validId(mark?.itemId) && isCount(mark.revision) && isSnapshot(mark.baseline)
	);
	return valid ? (marks as SeenMark[]) : null;
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
