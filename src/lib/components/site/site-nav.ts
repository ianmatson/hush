import { COMPARE_ORDER, COMPARE_OVERVIEW, comparePath } from '$lib/compare';
import { GUIDE_LABELS, GUIDE_ORDER, GUIDES_PATH, guidePath } from '$lib/guides';

export type SiteLink = { href: string; label: string };

export const COMPARE_PAGES: readonly SiteLink[] = COMPARE_ORDER.map((slug) => ({
	href: comparePath({ slug }),
	label: `vs ${COMPARE_OVERVIEW[slug].name}`
}));

export const GUIDE_PAGES: readonly SiteLink[] = GUIDE_ORDER.map((slug) => ({
	href: guidePath({ slug }),
	label: GUIDE_LABELS[slug]
}));

export const COMPARE_INDEX: SiteLink = { href: '/compare', label: 'Compare' };

export const GUIDES_SECTION: SiteLink = { href: GUIDES_PATH, label: 'Guides' };

const DOCS_SECTION: SiteLink = { href: '/docs', label: 'Docs' };
const PRICING_SECTION: SiteLink = { href: '/pricing', label: 'Pricing' };

export const HEADER_SECTIONS: readonly SiteLink[] = [DOCS_SECTION, PRICING_SECTION];

export const SITE_SECTIONS: readonly SiteLink[] = [
	DOCS_SECTION,
	GUIDES_SECTION,
	PRICING_SECTION,
	COMPARE_INDEX
];

export const SITE_ABOUT_PAGES: readonly SiteLink[] = [
	{ href: '/privacy', label: 'Privacy' },
	{ href: '/security', label: 'Security' }
];

export function isCurrentSection(pathname: string, href: string): boolean {
	const path = pathname.replace(/\/$/, '') || '/';
	return path === href || path.startsWith(`${href}/`);
}
