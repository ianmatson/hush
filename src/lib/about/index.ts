import { readPage, type MarkdownPage } from '$lib/docs';
import { INCLUDED, PLANS, PLAN_PRICES, PRICING_FAQ, PRICING_NOTE, planPrice } from '$lib/pricing';

/**
 * The site's pages for particular questions (privacy, security, pricing), next to the docs. Privacy
 * and security are Markdown in ./pages; pricing is made from the plans in lib/pricing.ts. Each one
 * is also Markdown at /<page>.md, and in /llms.txt.
 */
const FILES = import.meta.glob('./pages/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

export interface AboutPage extends MarkdownPage {
	sources: string[];
}

const md = (slug: string): AboutPage => ({
	slug,
	...readPage(`about: ${slug}.md`, FILES[`./pages/${slug}.md`] ?? ''),
	sources: [`src/lib/about/pages/${slug}.md`]
});

const pricingQuestions = PRICING_FAQ.map((q) => `### ${q.question}\n\n${q.answerMarkdown}`).join(
	'\n\n'
);

const pricing: AboutPage = {
	slug: 'pricing',
	title: 'Pricing',
	description: `${PRICING_NOTE} The plans, ${PLAN_PRICES}, and what the money pays for.`,
	markdown: `${PRICING_NOTE}

${PLANS.map((p) => `- **${p.name}:** ${planPrice(p)}. ${p.note}`).join('\n')}

Every plan has all of Hush:

${INCLUDED.map((x) => `- ${x}`).join('\n')}

The price pays for your share of the servers, card fees, and the upkeep of Hush. Hush has no ads, and it does not sell data. It is open source, so you can also run your own copy for free.

## Questions

${pricingQuestions}
`,
	sources: ['src/lib/pricing.ts', 'src/lib/about/index.ts']
};

export const ABOUT: AboutPage[] = [pricing, md('privacy'), md('security')];
