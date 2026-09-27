import type { Env } from './db';
import { factsOf } from './poller/schema';

const esc = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function renderFeed(env: Env, token: string, origin: string): Promise<Response> {
	const feed = await env.DB.prepare('SELECT user_id, view FROM feeds WHERE token = ?')
		.bind(token)
		.first<{ user_id: number; view: string }>();
	if (!feed) return new Response('Not found', { status: 404 });
	const tab = await env.POLLER.get(env.POLLER.idFromName(String(feed.user_id))).feedThreads(
		feed.view
	);
	// The saved view was deleted.
	if (!tab) return new Response('Not found', { status: 404 });
	const { name, rows } = tab;

	const self = `${origin}/feeds/${token}`;
	const updated = rows[0]?.gh_updated_at ?? new Date(0).toISOString();
	const entries = rows
		.map((r) => {
			const e = factsOf(r);
			const num = e?.number ? `#${e.number}` : '';
			return `  <entry>
    <id>tag:hush,${r.id}:${esc(r.gh_updated_at)}</id>
    <title>${esc(`${r.summary}: ${r.title}`)}</title>
    <link href="${esc(r.action_url)}"/>
    <updated>${esc(r.gh_updated_at)}</updated>
    <author><name>${esc(e?.author ?? r.repo)}</name></author>
    <category term="${esc(r.category)}"/>
    <summary>${esc(`${r.repo}${num} · ${r.why}${e?.lastComment?.body ? `\n\n${e.lastComment.body}` : ''}`)}</summary>
  </entry>`;
		})
		.join('\n');

	const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>tag:hush,feed:${feed.user_id}:${esc(feed.view)}</id>
  <title>${esc(`Hush · ${name}`)}</title>
  <link rel="self" href="${esc(self)}"/>
  <link href="${esc(origin)}/"/>
  <updated>${esc(updated)}</updated>
${entries}
</feed>
`;
	return new Response(xml, {
		headers: {
			'Content-Type': 'application/atom+xml; charset=utf-8',
			'Cache-Control': 'private, max-age=120',
			'X-Robots-Tag': 'noindex'
		}
	});
}
