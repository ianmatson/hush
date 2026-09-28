import { error } from '@sveltejs/kit';
import { ABOUT, aboutBySlug } from '$lib/about';
import { asMarkdown } from '$lib/docs';

// The pages for particular questions as Markdown, for agents: /privacy.md, /security.md, /pricing.md.
export const prerender = true;
export const entries = () => ABOUT.map((p) => ({ slug: p.slug }));

export function GET({ params }) {
	const page = aboutBySlug(params.slug);
	if (!page) error(404, 'No such page');
	return new Response(asMarkdown(page, `/${page.slug}`), {
		headers: { 'Content-Type': 'text/markdown; charset=utf-8' }
	});
}
