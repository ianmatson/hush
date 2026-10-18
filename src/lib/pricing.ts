import { REPO_URL } from '$lib/site';

/**
 * The plans on /pricing. Placeholders: Hush is free while it is in beta, and nothing can be bought
 * yet. The prices pay for each user's share of the servers (Cloudflare), card fees, and upkeep.
 */
export interface Plan {
	id: 'monthly' | 'yearly';
	name: string;
	/** US dollars for one `per`. */
	price: number;
	per: 'month' | 'year';
	note: string;
}

const MONTHLY_PRICE = 3;
const YEARLY_PRICE = 30;
const MONTHS_IN_A_YEAR = 12;

const dollars = (amount: number) => `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;

export const PLANS: Plan[] = [
	{ id: 'monthly', name: 'Monthly', price: MONTHLY_PRICE, per: 'month', note: 'Stop at any time.' },
	{
		id: 'yearly',
		name: 'Yearly',
		price: YEARLY_PRICE,
		per: 'year',
		note: `Two months free: ${dollars(YEARLY_PRICE / MONTHS_IN_A_YEAR)} a month.`
	}
];

export const planPrice = (p: Plan) => `${dollars(p.price)} a ${p.per}`;

export const PLAN_PRICES = PLANS.map(planPrice).join(' or ');

export const PLANNED_PRICE = `Free in beta; planned ${PLAN_PRICES}`;

/** What every plan has: all of Hush. */
export const INCLUDED = [
	'Views of your pull requests and issues, from your own searches',
	'Group by role, status, project, category, or your own sections',
	'Push for the facts that you choose, with quiet hours and digests',
	'Categories by rule or by Jev, and feeds',
	'Approve, comment, and merge from Hush',
	'Every setting in one settings.json'
];

export const PRICING_NOTE = 'Hush is free while it is in beta. Paid plans are not open yet.';

export interface PricingQuestion {
	question: string;
	answerMarkdown: string;
}

export const PRICING_FAQ: PricingQuestion[] = [
	{
		question: 'Why does Hush cost money?',
		answerMarkdown:
			'Hush checks GitHub for you every few minutes, all day, and keeps your lists on its servers. That costs a little for each person. Hush has no ads and does not sell data, so the price is the only thing that pays for it.'
	},
	{
		question: 'What is free now?',
		answerMarkdown: 'Everything. Hush is free while it is in beta, and paid plans are not open yet.'
	},
	{
		question: 'Can I run Hush myself?',
		answerMarkdown: `Yes. Hush is [open source](${REPO_URL}), and it runs on a free Cloudflare account. The README says how to set it up.`
	},
	{
		question: 'What happens to my data if I stop?',
		answerMarkdown:
			'**Delete account** in Settings deletes all of it at once. See [Privacy](/privacy).'
	}
];
