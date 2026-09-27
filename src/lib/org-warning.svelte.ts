import { api } from '$lib/api';
import { keys, queryClient } from '$lib/queries';

/**
 * The warning about orgs that hide their data from your sign-in. "Don't show again" is a note
 * for this browser, not a setting: it is kept in localStorage, and then the app never runs the
 * check by itself (Settings still has "Check now").
 */
const KEY = 'hush:org-warning-off';

function read(): boolean {
	try {
		return localStorage.getItem(KEY) === '1';
	} catch {
		return false;
	}
}

export const orgWarning = $state({ off: read() });

export function setOrgWarningOff(off: boolean) {
	orgWarning.off = off;
	try {
		if (off) localStorage.setItem(KEY, '1');
		else localStorage.removeItem(KEY);
	} catch {
		// Private mode: the choice lasts for this page only.
	}
}

/** Check the orgs now, and refresh the profile (its orgGaps feed the account menu). */
export async function checkOrgAccess() {
	const res = await api.orgAccess();
	await queryClient.invalidateQueries({ queryKey: keys.me });
	return res;
}
