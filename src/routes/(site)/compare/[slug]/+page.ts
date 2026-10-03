import { error } from '@sveltejs/kit';
import { COMPARE, compareBySlug } from '$lib/compare/content';

export const entries = () => COMPARE.map((p) => ({ slug: p.slug }));

export function load({ params }) {
	const page = compareBySlug(params.slug);
	if (!page) error(404, 'No such page');
	return { page };
}
