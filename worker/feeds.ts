import { sha256 } from './crypto';
import type { Env } from './db';

const esc = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function renderFeed(env: Env, token: string, origin: string): Promise<Response> {
	const feed = await env.DB.prepare('SELECT user_id, view FROM feeds WHERE token_hash = ?')
		.bind(await sha256(token))
		.first<{ user_id: number; view: string }>();
	if (!feed) return new Response('Not found', { status: 404 });
	const tab = await env.POLLER.get(env.POLLER.idFromName(String(feed.user_id))).feedItems(
		feed.view
	);
	// The saved search was deleted.
	if (!tab) return new Response('Not found', { status: 404 });
	const { name, items } = tab;

	const self = `${origin}/feeds/${token}`;
	const updated = items[0]?.activityAt ?? new Date(0).toISOString();
	const entries = items
		.map((i) => {
			const num = i.number ? `#${i.number}` : '';
			const comment = i.activity?.what === 'commented' ? `\n\n@${i.activity.by} commented` : '';
			return `  <entry>
    <id>tag:hush,${esc(i.key)}:${esc(i.activityAt)}</id>
    <title>${esc(`${i.summary}: ${i.title}`)}</title>
    <link href="${esc(i.actionUrl)}"/>
    <updated>${esc(i.activityAt)}</updated>
    <author><name>${esc(i.author ?? i.repo)}</name></author>
    <category term="${esc(i.lane)}"/>
    <summary>${esc(`${i.repo}${num} · ${i.reason}${i.event ? ` · ${i.event}` : ''}${comment}`)}</summary>
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
