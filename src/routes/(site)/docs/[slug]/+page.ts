import { error } from '@sveltejs/kit';
import { DOCS, docBySlug } from '$lib/docs';

/** Every docs page is written at build time. */
export const entries = () => DOCS.filter((d) => d.slug).map((d) => ({ slug: d.slug }));

export function load({ params }) {
	const doc = docBySlug(params.slug);
	if (!doc || !doc.slug) error(404, 'No such page');
	return { doc };
}
