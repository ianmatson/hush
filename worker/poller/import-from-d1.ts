// ONE-OFF (2026-09): the move of each user's data from D1 into their Durable Object. Runs once,
// when a Durable Object creates its tables. Delete this file, and drop the old D1 tables, in the
// next deploy.
import type { Env } from '../db';

type Row = Record<string, string | number | null>;

export async function importFromD1(env: Env, storage: DurableObjectStorage): Promise<void> {
	const userId = await storage.get<number>('userId');
	if (!userId) return;
	const q = async (sql: string) => {
		try {
			return (await env.DB.prepare(sql).bind(userId).all<Row>()).results;
		} catch {
			return []; // The table is already gone.
		}
	};
	const user = (await q('SELECT settings, threads_version FROM users WHERE id = ?'))[0];
	if (user) {
		await storage.put('settings', String(user.settings ?? '{}'));
		await storage.put('threadsVersion', Number(user.threads_version ?? 0) + 1);
	}
	const [threads, subjects, alerts, devices, hidden, moves, order] = await Promise.all([
		q('SELECT * FROM threads WHERE user_id = ?'),
		q('SELECT key, facts, changed_at FROM subjects WHERE user_id = ?'),
		q('SELECT sent_at, title, body, url, thread_id FROM alert_log WHERE user_id = ?'),
		q('SELECT endpoint, p256dh, auth, label, created_at FROM push_subscriptions WHERE user_id = ?'),
		q('SELECT item_id, updated_at FROM dash_hidden WHERE user_id = ?'),
		q('SELECT item_id, turn, updated_at FROM dash_moves WHERE user_id = ?'),
		q('SELECT item_id, rank FROM dash_order WHERE user_id = ?')
	]);
	const sql = storage.sql;
	storage.transactionSync(() => {
		for (const t of threads) {
			// The subject key comes from the PR or issue number in the old copy of its facts.
			const e = t.enrichment ? (JSON.parse(String(t.enrichment)) as { number?: number }) : null;
			const pr = t.subject_type === 'PullRequest' || t.subject_type === 'Issue';
			const key = pr && e?.number ? `${t.repo}#${e.number}` : null;
			sql.exec(
				`INSERT OR REPLACE INTO threads (id, repo, subject_type, subject_key, title, html_url, reason, unread,
           gh_updated_at, category, kind, summary, why, action_label, action_url, rule, triage, snoozed_until,
           snooze_event, snoozed_at, resolved_at, resolved_note, marked_unread_at, pushed_updated_at, pushed_at,
           first_seen_at)
         VALUES (${Array(26).fill('?').join(', ')})`,
				t.id,
				t.repo,
				t.subject_type,
				key,
				t.title,
				t.html_url,
				t.reason,
				t.unread,
				t.gh_updated_at,
				t.category,
				t.kind,
				t.summary,
				t.why,
				t.action_label,
				t.action_url,
				t.rule,
				t.triage,
				t.snoozed_until,
				t.snooze_event,
				t.snoozed_at,
				t.resolved_at,
				t.resolved_note,
				t.marked_unread_at,
				t.pushed_updated_at,
				t.pushed_at,
				t.first_seen_at
			);
		}
		for (const s of subjects)
			sql.exec('INSERT OR REPLACE INTO subjects VALUES (?, ?, ?)', s.key, s.facts, s.changed_at);
		for (const a of alerts)
			sql.exec(
				'INSERT INTO alerts (sent_at, title, body, url, thread_id) VALUES (?, ?, ?, ?, ?)',
				a.sent_at,
				a.title,
				a.body,
				a.url,
				a.thread_id
			);
		for (const d of devices)
			sql.exec(
				'INSERT OR REPLACE INTO push_devices VALUES (?, ?, ?, ?, ?)',
				d.endpoint,
				d.p256dh,
				d.auth,
				d.label,
				d.created_at
			);
		for (const h of hidden)
			sql.exec('INSERT OR REPLACE INTO dash_hidden VALUES (?, ?)', h.item_id, h.updated_at);
		for (const m of moves)
			sql.exec(
				'INSERT OR REPLACE INTO dash_moves VALUES (?, ?, ?)',
				m.item_id,
				m.turn,
				m.updated_at
			);
		for (const o of order)
			sql.exec('INSERT OR REPLACE INTO dash_order VALUES (?, ?)', o.item_id, o.rank);
	});
	console.log(
		`imported from D1: ${threads.length} threads, ${subjects.length} subjects, ${alerts.length} alerts`
	);
}
