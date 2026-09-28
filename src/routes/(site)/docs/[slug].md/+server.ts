import { error } from '@sveltejs/kit';
import { DOCS, docAsMarkdown, docBySlug } from '$lib/docs';

// Each docs page as Markdown, for agents: /docs/settings.md. The docs home is /docs/index.md.
export const prerender = true;
export const entries = () => DOCS.map((d) => ({ slug: d.slug || 'index' }));

export function GET({ params }) {
	const doc = docBySlug(params.slug === 'index' ? '' : params.slug);
	if (!doc) error(404, 'No such page');
	return new Response(docAsMarkdown(doc), {
		headers: { 'Content-Type': 'text/markdown; charset=utf-8' }
	});
}
