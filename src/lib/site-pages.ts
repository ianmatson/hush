import { ABOUT } from '$lib/about';
import { comparePath, compareSourceFile } from '$lib/compare';
import { COMPARE, COMPARE_INDEX } from '$lib/compare/content';
import {
	DOCS,
	docMarkdownPath,
	docPath,
	docSourceFile,
	navTitle,
	type MarkdownPage
} from '$lib/docs';
import { guidePath, guideSourceFile } from '$lib/guides';
import { GUIDES, GUIDES_INDEX } from '$lib/guides/content';
import { REPO_URL } from '$lib/site';

export type SiteCollection = 'docs' | 'about' | 'guides' | 'compare';

export interface SitePage extends MarkdownPage {
	collection: SiteCollection;
	group: string;
	navTitle: string;
	path: string;
	markdownPath: string;
	sources: string[];
}

const ABOUT_GROUP = 'About Hush';
const INDEX_MARKDOWN = 'index.md';

const COMPARE_INDEX_SOURCES = ['src/lib/compare/index.ts', 'src/lib/compare/content.ts'];
const GUIDES_INDEX_SOURCES = [
	'src/lib/guides/index.ts',
	'src/lib/guides/content.ts',
	...GUIDES.map(guideSourceFile)
];

function collectionPages(
	collection: 'guides' | 'compare',
	home: MarkdownPage & { path: string },
	homeSources: string[],
	pages: MarkdownPage[],
	pathOf: (p: MarkdownPage) => string,
	sourceOf: (p: MarkdownPage) => string
): SitePage[] {
	const group = home.title;
	return [
		{
			...home,
			collection,
			group,
			navTitle: navTitle(home),
			markdownPath: `${home.path}/${INDEX_MARKDOWN}`,
			sources: homeSources
		},
		...pages.map((p) => ({
			...p,
			collection,
			group,
			navTitle: navTitle(p),
			path: pathOf(p),
			markdownPath: `${pathOf(p)}.md`,
			sources: [sourceOf(p)]
		}))
	];
}

export const SITE_PAGES: SitePage[] = [
	...DOCS.map((d) => ({
		...d,
		collection: 'docs' as const,
		navTitle: navTitle(d),
		path: docPath(d),
		markdownPath: docMarkdownPath(d),
		sources: [docSourceFile(d)]
	})),
	...ABOUT.map((p) => ({
		...p,
		collection: 'about' as const,
		group: ABOUT_GROUP,
		navTitle: navTitle(p),
		path: `/${p.slug}`,
		markdownPath: `/${p.slug}.md`
	})),
	...collectionPages(
		'guides',
		GUIDES_INDEX,
		GUIDES_INDEX_SOURCES,
		GUIDES,
		guidePath,
		guideSourceFile
	),
	...collectionPages(
		'compare',
		COMPARE_INDEX,
		COMPARE_INDEX_SOURCES,
		COMPARE,
		comparePath,
		compareSourceFile
	)
];

export const sitePageAt = (path: string): SitePage => {
	const page = SITE_PAGES.find((p) => p.path === path);
	if (!page) throw new Error(`No site page at ${path}`);
	return page;
};

export const pagesOf = (collection: SiteCollection) =>
	SITE_PAGES.filter((p) => p.collection === collection);

export const markdownSlug = (p: SitePage) =>
	p.markdownPath.slice(p.markdownPath.lastIndexOf('/') + 1).replace(/\.md$/, '');

export const collectionHome = (collection: SiteCollection) =>
	pagesOf(collection).find((p) => !p.slug);

export const sourceEditUrl = (p: SitePage) => `${REPO_URL}/edit/main/${p.sources[0]}`;
