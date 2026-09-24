import type { FeedFilter } from '../src/lib/shared/types';
import { globToRegExp } from '../src/lib/shared/classify';
import type { Env, ThreadRow } from './db';

const esc = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function renderFeed(env: Env, token: string, origin: string): Promise<Response> {
	const feed = await env.DB.prepare('SELECT id, user_id, name, filter FROM feeds WHERE token = ?')
		.bind(token)
		.first<{ id: string; user_id: number; name: string; filter: string }>();
	if (!feed) return new Response('Not found', { status: 404 });
	const filter = JSON.parse(feed.filter) as FeedFilter;

	const where = ['user_id = ?1', "category != 'muted'"];
	if (filter.view === 'action' || filter.view === 'fyi') where.push(`category = '${filter.view}'`);
	const { results } = await env.DB.prepare(
		`SELECT * FROM threads WHERE ${where.join(' AND ')} ORDER BY gh_updated_at DESC LIMIT 200`
	)
		.bind(feed.user_id)
		.all<ThreadRow>();
	const repoRe = filter.repo ? globToRegExp(filter.repo) : null;
	const rows = results.filter((r) => !repoRe || repoRe.test(r.repo)).slice(0, 50);

	const self = `${origin}/feeds/${token}`;
	const updated = rows[0]?.gh_updated_at ?? new Date(0).toISOString();
	const entries = rows
		.map((r) => {
			const e = r.enrichment ? JSON.parse(r.enrichment) : null;
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
  <id>tag:hush,feed:${feed.id}</id>
  <title>${esc(`Hush · ${feed.name}`)}</title>
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
