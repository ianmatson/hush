export type SiteLink = { href: string; label: string };

export const COMPARE_PAGES: readonly SiteLink[] = [];

export const COMPARE_INDEX: SiteLink = { href: '/compare', label: 'Compare' };

const hasComparePages = COMPARE_PAGES.length > 0;

export const SITE_SECTIONS: readonly SiteLink[] = [
	{ href: '/docs', label: 'Docs' },
	{ href: '/pricing', label: 'Pricing' },
	...(hasComparePages ? [COMPARE_INDEX] : [])
];

export const SITE_ABOUT_PAGES: readonly SiteLink[] = [
	{ href: '/privacy', label: 'Privacy' },
	{ href: '/security', label: 'Security' }
];

export function isCurrentSection(pathname: string, href: string): boolean {
	const path = pathname.replace(/\/$/, '') || '/';
	return path === href || path.startsWith(`${href}/`);
}
