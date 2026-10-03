import { error } from '@sveltejs/kit';
import { GUIDES, guideBySlug } from '$lib/guides';

export const entries = () => GUIDES.map((p) => ({ slug: p.slug }));

export function load({ params }) {
	const page = guideBySlug(params.slug);
	if (!page) error(404, 'No such page');
	return { page };
}
