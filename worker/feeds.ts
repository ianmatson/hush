import { escapeHtml } from '../src/lib/shared/html';
import { sha256 } from './crypto';
import type { Env } from './db';

export async function renderFeed(env: Env, token: string): Promise<Response> {
	const origin = env.APP_URL;
	const feed = await env.DB.prepare('SELECT user_id, view FROM feeds WHERE token_hash = ?')
		.bind(await sha256(token))
		.first<{ user_id: number; view: string }>();
	if (!feed) return new Response('Not found', { status: 404 });
	const tab = await env.WORKSPACE.get(env.WORKSPACE.idFromName(String(feed.user_id))).feedEntries(
		feed.view
	);
	if (!tab) return new Response('Not found', { status: 404 });
	const { name, entries } = tab;

	const self = `${origin}/feeds/${token}`;
	const updated = entries[0]?.updated ?? new Date(0).toISOString();
	const xmlEntries = entries
		.map(
			(e) => `  <entry>
    <id>tag:hush,${escapeHtml(e.id)}:${escapeHtml(e.updated)}</id>
    <title>${escapeHtml(e.title)}</title>
    <link href="${escapeHtml(e.link)}"/>
    <updated>${escapeHtml(e.updated)}</updated>
    <author><name>${escapeHtml(e.author)}</name></author>${e.category ? `\n    <category term="${escapeHtml(e.category)}"/>` : ''}
    <summary>${escapeHtml(e.summary)}</summary>
  </entry>`
		)
		.join('\n');

	const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>tag:hush,feed:${feed.user_id}:${escapeHtml(feed.view)}</id>
  <title>${escapeHtml(`Hush · ${name}`)}</title>
  <link rel="self" href="${escapeHtml(self)}"/>
  <link href="${escapeHtml(origin)}/"/>
  <updated>${escapeHtml(updated)}</updated>
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
