import { error } from '@sveltejs/kit';
import { comparePath } from '$lib/compare';
import { COMPARE, compareBySlug } from '$lib/compare/content';
import { asMarkdown } from '$lib/docs';

export const prerender = true;
export const entries = () => COMPARE.map((p) => ({ slug: p.slug }));

export function GET({ params }) {
	const page = compareBySlug(params.slug);
	if (!page) error(404, 'No such page');
	return new Response(asMarkdown(page, comparePath(page)), {
		headers: { 'Content-Type': 'text/markdown; charset=utf-8' }
	});
}
