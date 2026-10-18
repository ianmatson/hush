import { renderMarkdown } from '$lib/docs';
import { SITE_PAGES, type SitePage } from '$lib/site-pages';

const TEXT_FILES = ['/llms.txt', '/llms-full.txt'];
const OUTSIDE_SITE = /^(https?|mailto):/;

const idsIn = (html: string) => new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));

const ANCHORS = new Map(SITE_PAGES.map((p) => [p.path, idsIn(renderMarkdown(p.markdown).html)]));
const FILES = new Set([...TEXT_FILES, ...SITE_PAGES.map((p) => p.markdownPath)]);

function goesNowhere(href: string, fromPath: string): boolean {
	if (OUTSIDE_SITE.test(href)) return false;
	const [path, hash] = href.split('#');
	const target = path || fromPath;
	if (FILES.has(target)) return false;
	const anchors = ANCHORS.get(target);
	return !anchors || (!!hash && !anchors.has(hash));
}

export const brokenLinks = (fromPath: string, html: string): string[] =>
	[...html.matchAll(/ href="([^"]+)"/g)]
		.map(([, href]) => href)
		.filter((href) => goesNowhere(href, fromPath));

export const brokenLinksOf = (page: SitePage) =>
	brokenLinks(page.path, renderMarkdown(page.markdown).html);
