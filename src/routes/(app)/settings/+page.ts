import { redirect } from '@sveltejs/kit';
import { SETTINGS_SECTIONS } from '$lib/shared/settings-schema';

export const load = () => redirect(307, SETTINGS_SECTIONS.general.href);
