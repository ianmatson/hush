import { error } from '@sveltejs/kit';
import { guidePath } from '$lib/guides';
import { GUIDES, guideBySlug } from '$lib/guides/content';
import { asMarkdown } from '$lib/docs';

export const prerender = true;
export const entries = () => GUIDES.map((p) => ({ slug: p.slug }));

export function GET({ params }) {
	const page = guideBySlug(params.slug);
	if (!page) error(404, 'No such page');
	return new Response(asMarkdown(page, guidePath(page)), {
		headers: { 'Content-Type': 'text/markdown; charset=utf-8' }
	});
}
