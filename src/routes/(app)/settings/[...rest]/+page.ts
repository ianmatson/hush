import { redirect } from '@sveltejs/kit';

/** Pages that moved: the old names still open the right page. */
const MOVED: Record<string, string> = {
	general: '/settings/account',
	appearance: '/settings/account',
	account: '/settings/account',
	inbox: '/settings/advanced#rules',
	dashboards: '/settings/advanced#searches',
	menus: '/settings/advanced#menu',
	feeds: '/settings/advanced#feeds'
};

export const load = ({ params }) => redirect(307, MOVED[params.rest] ?? '/settings');
