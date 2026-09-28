import { redirect } from '@sveltejs/kit';

/** Pages that were merged: Appearance, Menus, and Account are on General; Feeds is on Inbox. */
const MOVED: Record<string, string> = {
	appearance: '/settings/general',
	menus: '/settings/general',
	account: '/settings/general',
	feeds: '/settings/inbox#views'
};

export const load = ({ params }) => redirect(307, MOVED[params.rest] ?? '/settings');
