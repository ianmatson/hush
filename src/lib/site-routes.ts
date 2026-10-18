import { error } from '@sveltejs/kit';
import { asMarkdown } from '$lib/docs';
import { markdownSlug, pagesOf, type SiteCollection, type SitePage } from '$lib/site-pages';

type SlugParams = { params: { slug: string } };

const MARKDOWN_HEADERS = { 'Content-Type': 'text/markdown; charset=utf-8' };
const NOT_FOUND = 'No such page';

export function markdownRoute(collection: SiteCollection) {
	const pages = pagesOf(collection);
	return {
		entries: () => pages.map((p) => ({ slug: markdownSlug(p) })),
		GET({ params }: SlugParams) {
			const page = pages.find((p) => markdownSlug(p) === params.slug);
			if (!page) error(404, NOT_FOUND);
			return new Response(asMarkdown(page, page.path), { headers: MARKDOWN_HEADERS });
		}
	};
}

export function pageRoute(collection: SiteCollection) {
	const pages = pagesOf(collection).filter((p) => p.slug);
	return {
		entries: () => pages.map((p) => ({ slug: p.slug })),
		load({ params }: SlugParams): { page: SitePage } {
			const page = pages.find((p) => p.slug === params.slug);
			if (!page) error(404, NOT_FOUND);
			return { page };
		}
	};
}
