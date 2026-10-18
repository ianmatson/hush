import { execFileSync } from 'node:child_process';
import { SITE_URL } from '$lib/site';
import { SITE_PAGES } from '$lib/site-pages';

// Written once at build time, like the pages it lists.
export const prerender = true;

type SitemapPage = { path: string; sources: string[] };

const ROUTE_FILES = Object.keys(import.meta.glob('/src/routes/(site)/**/+page.svelte'));

const routePath = (file: string) =>
	file
		.replace('/src/routes', '')
		.replace(/\/\([^)]+\)/g, '')
		.replace(/\/\+page\.svelte$/, '') || '/';

/**
 * Every public page, found from the files in (site): a new page is in the sitemap with no extra
 * step. Route groups ("(site)") are not in URLs; the 404 page is left out. Pages with a parameter
 * (the docs) come from their own lists.
 */
function sitemapPages(): SitemapPage[] {
	const sources = new Map<string, Set<string>>();
	const add = (path: string, files: string[]) => {
		const known = sources.get(path) ?? new Set<string>();
		for (const file of files) known.add(file);
		sources.set(path, known);
	};
	for (const file of ROUTE_FILES) {
		const path = routePath(file);
		if (path !== '/404' && !path.includes('[')) add(path, [file.slice(1)]);
	}
	for (const page of SITE_PAGES) add(page.path, page.sources);
	return [...sources]
		.map(([path, files]) => ({ path, sources: [...files] }))
		.sort((a, b) => a.path.localeCompare(b.path));
}

function lastCommitDate(files: string[]): string | null {
	try {
		const date = execFileSync('git', ['log', '-1', '--format=%cs', '--', ...files], {
			encoding: 'utf8'
		}).trim();
		return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
	} catch {
		return null;
	}
}

export function GET() {
	const urls = sitemapPages()
		.map(({ path, sources }) => {
			const lastmod = lastCommitDate(sources);
			const lastmodTag = lastmod ? `<lastmod>${lastmod}</lastmod>` : '';
			return `  <url><loc>${SITE_URL}${path}</loc>${lastmodTag}</url>`;
		})
		.join('\n');
	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
		{ headers: { 'Content-Type': 'application/xml' } }
	);
}
