import { PRICING_NOTE } from '$lib/pricing';
import { REPO_URL, SHORT_NAME, SITE_NAME, SITE_URL } from '$lib/site';

export type JsonLd = Record<string, unknown>;

const SCHEMA_CONTEXT = 'https://schema.org';

export const SOFTWARE_DESCRIPTION =
	'Hush for GitHub is an open-source web app that sorts GitHub notifications into what needs you and what is only FYI, shows whose turn it is on every pull request and issue, and pushes only what waits on you.';

export function websiteData(): JsonLd {
	return {
		'@context': SCHEMA_CONTEXT,
		'@type': 'WebSite',
		name: SITE_NAME,
		alternateName: SHORT_NAME,
		url: SITE_URL
	};
}

export function softwareData(): JsonLd {
	return {
		'@context': SCHEMA_CONTEXT,
		'@type': 'SoftwareApplication',
		name: SITE_NAME,
		alternateName: SHORT_NAME,
		description: SOFTWARE_DESCRIPTION,
		url: SITE_URL,
		applicationCategory: 'DeveloperApplication',
		operatingSystem: 'Web browser',
		isAccessibleForFree: true,
		offers: {
			'@type': 'Offer',
			name: 'Beta',
			description: PRICING_NOTE,
			price: 0,
			priceCurrency: 'USD'
		},
		sameAs: [REPO_URL]
	};
}

export type Crumb = { name: string; path: string };

export function articleData(opts: {
	type: 'TechArticle' | 'Article';
	title: string;
	description: string;
	path: string;
	crumbs: Crumb[];
}): JsonLd[] {
	const url = SITE_URL + opts.path;
	return [
		{
			'@context': SCHEMA_CONTEXT,
			'@type': opts.type,
			headline: opts.title,
			description: opts.description,
			url,
			mainEntityOfPage: url,
			inLanguage: 'en',
			publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
			about: { '@type': 'SoftwareApplication', name: SITE_NAME, url: SITE_URL }
		},
		{
			'@context': SCHEMA_CONTEXT,
			'@type': 'BreadcrumbList',
			itemListElement: opts.crumbs.map((crumb, i) => ({
				'@type': 'ListItem',
				position: i + 1,
				name: crumb.name,
				item: SITE_URL + crumb.path
			}))
		}
	];
}

export function jsonLdScript(data: JsonLd): string {
	const json = JSON.stringify(data).replace(/</g, '\\u003c');
	return `<script type="application/ld+json">${json}</` + 'script>';
}
