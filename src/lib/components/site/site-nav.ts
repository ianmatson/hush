import { COMPARE_ORDER, COMPARE_OVERVIEW, comparePath } from '$lib/compare';

export type SiteLink = { href: string; label: string };

export const COMPARE_PAGES: readonly SiteLink[] = COMPARE_ORDER.map((slug) => ({
	href: comparePath({ slug }),
	label: `vs ${COMPARE_OVERVIEW[slug].name}`
}));

export const COMPARE_INDEX: SiteLink = { href: '/compare', label: 'Compare' };

export const SITE_SECTIONS: readonly SiteLink[] = [
	{ href: '/docs', label: 'Docs' },
	{ href: '/pricing', label: 'Pricing' },
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
