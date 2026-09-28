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

export const PLANS: Plan[] = [
	{ id: 'monthly', name: 'Monthly', price: 3, per: 'month', note: 'Stop at any time.' },
	{
		id: 'yearly',
		name: 'Yearly',
		price: 30,
		per: 'year',
		note: 'Two months free: $2.50 a month.'
	}
];

/** What every plan has: all of Hush. */
export const INCLUDED = [
	'Your inbox, sorted into Needs you and FYI',
	'Pull requests and issues by whose turn it is',
	'Push on every device, with quiet hours',
	'Rules, saved views, and feeds',
	'Approve, comment, and merge from Hush',
	'Every setting in one settings.json'
];

export const PRICING_NOTE = 'Hush is free while it is in beta. Paid plans are not open yet.';
