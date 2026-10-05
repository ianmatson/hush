import { sha256 } from './crypto';
import type { Env } from './db';

const esc = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function renderFeed(env: Env, token: string, origin: string): Promise<Response> {
	const feed = await env.DB.prepare('SELECT user_id, view FROM feeds WHERE token_hash = ?')
		.bind(await sha256(token))
		.first<{ user_id: number; view: string }>();
	if (!feed) return new Response('Not found', { status: 404 });
	const tab = await env.POLLER.get(env.POLLER.idFromName(String(feed.user_id))).feedEntries(
		feed.view
	);
	if (!tab) return new Response('Not found', { status: 404 });
	const { name, entries } = tab;

	const self = `${origin}/feeds/${token}`;
	const updated = entries[0]?.updated ?? new Date(0).toISOString();
	const xmlEntries = entries
		.map(
			(e) => `  <entry>
    <id>tag:hush,${esc(e.id)}:${esc(e.updated)}</id>
    <title>${esc(e.title)}</title>
    <link href="${esc(e.link)}"/>
    <updated>${esc(e.updated)}</updated>
    <author><name>${esc(e.author)}</name></author>${e.category ? `\n    <category term="${esc(e.category)}"/>` : ''}
    <summary>${esc(e.summary)}</summary>
  </entry>`
		)
		.join('\n');

	const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>tag:hush,feed:${feed.user_id}:${esc(feed.view)}</id>
  <title>${esc(`Hush · ${name}`)}</title>
  <link rel="self" href="${esc(self)}"/>
  <link href="${esc(origin)}/"/>
  <updated>${esc(updated)}</updated>
${xmlEntries}
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
