import { redirect } from '@sveltejs/kit';

/** Pages that were merged or removed. */
const MOVED: Record<string, string> = {
	appearance: '/settings/general',
	menus: '/settings/general',
	account: '/settings/general',
	feeds: '/settings/views',
	inbox: '/settings/categories#smart-decisions'
};

export const load = ({ params }) => redirect(307, MOVED[params.rest] ?? '/settings');
