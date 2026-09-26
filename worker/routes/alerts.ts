import type { AlertDTO } from '../../src/lib/shared/types';
import { routes } from '../app';

const app = routes();

// --- Alert history -----------------------------------------------------------

app.get('/api/alerts', async (c) => {
	const { results } = await c.env.DB.prepare(
		`SELECT a.id, a.sent_at, a.title, a.body, a.url, t.id AS tid, t.repo, t.title AS ttitle,
            t.html_url, t.triage, t.snoozed_until, t.resolved_note,
            json_extract(t.enrichment, '$.number') AS number
     FROM alert_log a LEFT JOIN threads t ON t.user_id = a.user_id AND t.id = a.thread_id
     WHERE a.user_id = ? ORDER BY a.sent_at DESC, a.id DESC LIMIT 100`
	)
		.bind(c.get('user').id)
		.all<{
			id: number;
			sent_at: number;
			title: string;
			body: string;
			url: string;
			tid: string | null;
			repo: string;
			ttitle: string;
			html_url: string;
			triage: string;
			snoozed_until: number | null;
			resolved_note: string | null;
			number: number | null;
		}>();
	const now = Date.now();
	const state = (r: (typeof results)[number]) =>
		r.triage === 'done'
			? (r.resolved_note ?? 'Done')
			: r.triage === 'muted'
				? 'Muted'
				: r.triage === 'snoozed' && (r.snoozed_until ?? 0) > now
					? 'Snoozed'
					: null;
	return c.json(
		results.map((r): AlertDTO => ({
			id: r.id,
			sentAt: r.sent_at,
			title: r.title,
			body: r.body,
			url: r.url,
			thread: r.tid
				? {
						repo: r.repo,
						number: r.number,
						title: r.ttitle,
						htmlUrl: r.html_url,
						state: state(r)
					}
				: null
		}))
	);
});

export default app;
