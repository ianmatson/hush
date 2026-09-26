import { classify } from '../../src/lib/shared/classify';
import {
	SNOOZE_EVENT_MAX_MS,
	snoozeEvent,
	snoozeOutcome,
	type SnoozeEvent
} from '../../src/lib/shared/snooze';
import type { Counts, Enrichment, ThreadDTO, View } from '../../src/lib/shared/types';
import {
	bumpVersion,
	parseSettings,
	toDTO,
	userToken,
	viewWhere,
	type Env,
	type ThreadRow,
	type UserRow,
	factsFromRow
} from '../db';
import { markThreadDone, markThreadRead, muteThread } from '../github';
import { MUTED_BY_USER } from '../poller';
import { routes, type Ctx, poller } from '../app';

const VIEWS = new Set<View>(['action', 'fyi', 'snoozed', 'done', 'muted', 'all', 'inbox']);

const app = routes();

// --- Threads ----------------------------------------------------------------

async function counts(env: Env, userId: number): Promise<Counts> {
	const now = Date.now();
	const row = await env.DB.prepare(
		`SELECT
       SUM(CASE WHEN ${viewWhere('action')} THEN 1 ELSE 0 END) AS action,
       SUM(CASE WHEN ${viewWhere('fyi')} THEN 1 ELSE 0 END) AS fyi,
       SUM(CASE WHEN ${viewWhere('snoozed')} THEN 1 ELSE 0 END) AS snoozed
     FROM threads WHERE user_id = ?1`
	)
		.bind(userId, now)
		.first<Counts>();
	return { action: row?.action ?? 0, fyi: row?.fyi ?? 0, snoozed: row?.snoozed ?? 0 };
}

const SEEN_EVERY = 5 * 60_000;

/**
 * Opening the UI means the user is active: record it and let the poller poll soon. At most once
 * every 5 minutes, so an open tab does not cost a D1 write and a DO request each minute.
 */
function markSeen(c: Ctx, u: UserRow) {
	const now = Date.now();
	if (u.last_seen_at && now - u.last_seen_at < SEEN_EVERY) return;
	c.executionCtx.waitUntil(
		Promise.all([
			c.env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(now, u.id).run(),
			poller(c.env, u.id).touch(new URL(c.req.url).origin)
		])
	);
}

app.get('/api/threads', async (c) => {
	const u = c.get('user');
	const view = (c.req.query('view') ?? 'action') as View;
	if (!VIEWS.has(view)) return c.json({ error: 'Unknown view' }, 400);
	markSeen(c, u);
	// Nothing changed since the client's copy: answer 304 without reading any threads.
	const etag = `W/"${u.id}.${u.threads_version}.${view}"`;
	const noStore = { 'Cache-Control': 'private, no-cache', ETag: etag };
	if (c.req.header('If-None-Match') === etag) return c.body(null, 304, noStore);
	const order = view === 'snoozed' ? 'snoozed_until ASC' : 'gh_updated_at DESC';
	const { results } = await c.env.DB.prepare(
		`SELECT * FROM threads WHERE ${viewWhere(view)} ORDER BY ${order} LIMIT 300`
	)
		.bind(u.id, Date.now())
		.all<ThreadRow>();
	const threads: ThreadDTO[] = results.map(toDTO);
	return c.json({ threads, counts: await counts(c.env, u.id) }, 200, noStore);
});

type ThreadAction =
	'done' | 'undone' | 'read' | 'unread' | 'snooze' | 'unsnooze' | 'mute' | 'unmute';
const THREAD_ACTIONS = new Set<ThreadAction>([
	'done',
	'undone',
	'read',
	'unread',
	'snooze',
	'unsnooze',
	'mute',
	'unmute'
]);
// Mute makes 2 GitHub calls per thread; 20 × 2 stays under the Free plan's 50 subrequests.
const BULK_MAX = 20;

/** Apply one triage action to up to BULK_MAX threads: one D1 batch, one version bump. */
async function applyThreadAction(c: Ctx, ids: string[], action: ThreadAction) {
	const u = c.get('user');
	const db = c.env.DB;
	if (!THREAD_ACTIONS.has(action)) return c.json({ error: 'Unknown action' }, 400);
	if (!ids.length || ids.length > BULK_MAX || ids.some((id) => typeof id !== 'string'))
		return c.json({ error: `Select 1 to ${BULK_MAX} threads.` }, 400);
	const body = await c.req
		.json<{ until?: number; event?: SnoozeEvent }>()
		.catch(() => ({}) as { until?: number; event?: SnoozeEvent });
	// "Until something happens": the time is only a deadline (default 7 days).
	const event = action === 'snooze' ? (body.event ?? null) : null;
	if (event && !snoozeEvent(event)) return c.json({ error: 'Unknown snooze condition.' }, 400);
	if (event) body.until ??= Date.now() + SNOOZE_EVENT_MAX_MS;
	if (action === 'snooze' && (!body.until || body.until < Date.now()))
		return c.json({ error: 'Snooze time must be in the future.' }, 400);

	const { results: threads } = await db
		.prepare(`SELECT * FROM threads WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`)
		.bind(u.id, ...ids)
		.all<ThreadRow>();
	if (!threads.length) return c.json({ error: 'Not found' }, 404);
	// A state that is already true would wake the thread at once: refuse it with a clear reason.
	if (event) {
		const ev = snoozeEvent(event)!;
		const now = Date.now();
		// Only PRs and issues have the data these conditions read.
		const kindOf = (t: ThreadRow) =>
			t.enrichment ? (JSON.parse(t.enrichment) as Enrichment).kind : 'other';
		if (threads.some((t) => !ev.kinds.includes(kindOf(t) as 'pr' | 'issue')))
			return c.json(
				{
					error: `"${ev.label}" works only for ${ev.kinds.map((k) => (k === 'pr' ? 'pull requests' : 'issues')).join(' and ')}.`
				},
				400
			);
		// Refuse what would end at once: the event already happened, or the PR is already closed.
		const endsNow = (t: ThreadRow) =>
			snoozeOutcome(
				ev.id,
				t.enrichment ? (JSON.parse(t.enrichment) as Enrichment) : null,
				now,
				u.login
			);
		const already = threads.filter((t) => endsNow(t).wake);
		if (already.length === threads.length) {
			const o = endsNow(already[0]);
			return c.json(
				{ error: `${o.wake ? o.reason : 'Done'} already. Pick another condition.` },
				400
			);
		}
		if (already.length)
			threads.splice(0, threads.length, ...threads.filter((t) => !already.includes(t)));
	}

	// Your own triage choice replaces an automatic one (see the inbox watcher).
	const NOT_AUTO = `resolved_at = NULL, resolved_note = NULL`;
	const update = (t: ThreadRow, sql: string, ...args: unknown[]) =>
		db.prepare(`UPDATE threads SET ${sql} WHERE user_id = ? AND id = ?`).bind(...args, u.id, t.id);
	const settings = action === 'unmute' ? parseSettings(u.settings) : null;
	const stmts = threads.map((t) => {
		switch (action) {
			case 'done':
				return update(
					t,
					`triage = 'done', snoozed_until = NULL, snooze_event = NULL, unread = 0, ${NOT_AUTO}`
				);
			case 'undone':
			case 'unsnooze':
				return update(
					t,
					`triage = 'inbox', snoozed_until = NULL, snooze_event = NULL, ${NOT_AUTO}`
				);
			case 'read':
				return update(t, `unread = 0, marked_unread_at = NULL`);
			// GitHub has no "mark as unread" API, so this one stays in Hush (and the read sync from
			// GitHub leaves it alone until you read the thread there again).
			case 'unread':
				return update(t, `unread = 1, marked_unread_at = ?`, Date.now());
			case 'snooze':
				return update(
					t,
					`triage = 'snoozed', snoozed_until = ?, snooze_event = ?, snoozed_at = ?`,
					body.until,
					event,
					Date.now()
				);
			case 'mute':
				return update(
					t,
					`category = 'muted', rule = ?, triage = 'done', snoozed_until = NULL, snooze_event = NULL`,
					MUTED_BY_USER
				);
			case 'unmute': {
				const cls = classify(factsFromRow(t, u.login), settings!);
				return update(
					t,
					`category = ?, rule = ?, triage = 'inbox'`,
					cls.category,
					cls.rule ?? null
				);
			}
		}
	});
	await db.batch([...stmts, bumpVersion(c.env, u.id)]);

	// Mirror the change on GitHub in the background.
	if (action === 'done' || action === 'read' || action === 'mute') {
		const token = await userToken(c.env, u);
		const mirror = (id: string) =>
			action === 'done'
				? markThreadDone(token, id)
				: action === 'read'
					? markThreadRead(token, id)
					: muteThread(token, id).then(() => markThreadDone(token, id));
		c.executionCtx.waitUntil(Promise.allSettled(threads.map((t) => mirror(t.id))));
	}
	// Alerts for these threads on your other devices: replace them with a quiet note.
	const RESOLVED_NOTE: Partial<Record<ThreadAction, string>> = {
		done: 'Done',
		mute: 'Muted',
		snooze: 'Snoozed'
	};
	const note = RESOLVED_NOTE[action];
	if (note)
		c.executionCtx.waitUntil(
			poller(c.env, u.id).notifyResolved(threads.map((t) => ({ id: t.id, note })))
		);
	return c.json({ ok: true, updated: threads.length, counts: await counts(c.env, u.id) });
}

// Before the :id route, so "bulk" is not read as a thread id.
app.post('/api/threads/bulk/:action', async (c) => {
	const ids = c.req.query('ids')?.split(',').filter(Boolean) ?? [];
	return applyThreadAction(c, ids, c.req.param('action') as ThreadAction);
});

app.post('/api/threads/:id/:action', (c) =>
	applyThreadAction(c, [c.req.param('id')], c.req.param('action') as ThreadAction)
);

app.post('/api/sync', async (c) => {
	const u = c.get('user');
	return c.json(await poller(c.env, u.id).pollNow());
});

export default app;
