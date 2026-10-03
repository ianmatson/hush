import { execFileSync } from 'node:child_process';
import { COMPARE, comparePath } from '$lib/compare';
import { DOCS, docPath } from '$lib/docs';
import { SITE_URL } from '$lib/site';

// Written once at build time, like the pages it lists.
export const prerender = true;

type SitemapPage = { path: string; sources: string[] };

const ROUTE_FILES = Object.keys(import.meta.glob('/src/routes/(site)/**/+page.svelte'));

const routePath = (file: string) =>
	file
		.replace('/src/routes', '')
		.replace(/\/\([^)]+\)/g, '')
		.replace(/\/\+page\.svelte$/, '') || '/';

const CONTENT_SOURCES: Record<string, string[]> = {
	'/privacy': ['src/lib/about/pages/privacy.md'],
	'/security': ['src/lib/about/pages/security.md'],
	'/pricing': ['src/lib/pricing.ts'],
	'/compare': ['src/lib/compare/index.ts']
};

/**
 * Every public page, found from the files in (site): a new page is in the sitemap with no extra
 * step. Route groups ("(site)") are not in URLs; the 404 page is left out. Pages with a parameter
 * (the docs) come from their own lists.
 */
const pages: SitemapPage[] = [
	...ROUTE_FILES.map((file) => ({ file, path: routePath(file) }))
		.filter(({ path }) => path !== '/404' && !path.includes('['))
		.map(({ file, path }) => ({
			path,
			sources: [file.slice(1), ...(CONTENT_SOURCES[path] ?? [])]
		})),
	...DOCS.map((d) => ({
		path: docPath(d),
		sources: [`src/lib/docs/pages/${d.slug || 'index'}.md`]
	})),
	...COMPARE.map((c) => ({
		path: comparePath(c),
		sources: [`src/lib/compare/pages/${c.slug}.md`]
	}))
]
	.filter((page, i, all) => all.findIndex((p) => p.path === page.path) === i)
	.sort((a, b) => a.path.localeCompare(b.path));

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
	const urls = pages
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
