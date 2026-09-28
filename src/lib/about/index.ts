import { readPage } from '$lib/docs';
import { INCLUDED, PLANS, PRICING_NOTE } from '$lib/pricing';

/**
 * The site's pages for particular questions (privacy, security, pricing), next to the docs. Privacy
 * and security are Markdown in ./pages; pricing is made from the plans in lib/pricing.ts. Each one
 * is also Markdown at /<page>.md, and in /llms.txt.
 */
export interface AboutPage {
	slug: string;
	title: string;
	description: string;
	markdown: string;
}

const FILES = import.meta.glob('./pages/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const md = (slug: string): AboutPage => ({
	slug,
	...readPage(`about: ${slug}.md`, FILES[`./pages/${slug}.md`] ?? '')
});

const pricing: AboutPage = {
	slug: 'pricing',
	title: 'Pricing',
	description: 'What Hush costs, and what the money pays for.',
	markdown: `${PRICING_NOTE}

${PLANS.map((p) => `- **${p.name}:** $${p.price} a ${p.per}. ${p.note}`).join('\n')}

Every plan has all of Hush:

${INCLUDED.map((x) => `- ${x}`).join('\n')}

The price pays for your share of the servers, card fees, and the upkeep of Hush. Hush has no ads, and it does not sell data. It is open source, so you can also run your own copy for free.
`
};

export const ABOUT: AboutPage[] = [pricing, md('privacy'), md('security')];
export const aboutBySlug = (s: string) => ABOUT.find((p) => p.slug === s);
