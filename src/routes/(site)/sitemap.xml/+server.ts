import { DOCS, docPath } from '$lib/docs';
import { SITE_URL } from '$lib/site';

// Written once at build time, like the pages it lists.
export const prerender = true;

/**
 * Every public page, found from the files in (site): a new page is in the sitemap with no extra
 * step. Route groups ("(site)") are not in URLs; the 404 page is left out. Pages with a parameter
 * (the docs) come from their own lists.
 */
const pages = Object.keys(import.meta.glob('/src/routes/(site)/**/+page.svelte'))
	.map((file) =>
		file
			.replace('/src/routes', '')
			.replace(/\/\([^)]+\)/g, '')
			.replace(/\/\+page\.svelte$/, '')
	)
	.filter((path) => path !== '/404' && !path.includes('['))
	.map((path) => path || '/')
	.concat(DOCS.map(docPath))
	.filter((path, i, all) => all.indexOf(path) === i)
	.sort();

export function GET() {
	const urls = pages.map((p) => `  <url><loc>${SITE_URL}${p}</loc></url>`).join('\n');
	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
		{ headers: { 'Content-Type': 'application/xml' } }
	);
}
