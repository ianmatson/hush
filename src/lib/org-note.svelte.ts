import { api } from '$lib/api';
import type { OrgAccess } from '$lib/shared/types';

/**
 * The orgs your GitHub sign-in can see. GitHub hides every org that has not approved Hush, with
 * no error or count, so Hush cannot find the missing ones: it shows what it sees, and you spot a
 * gap. After sign-in, a note shows the list once. "Don't show again" is a note for this browser
 * (localStorage), not a setting: then the app loads the list only when you ask for it.
 */
const KEY = 'hush:org-note-off';

function read(): boolean {
	try {
		return localStorage.getItem(KEY) === '1';
	} catch {
		return false;
	}
}

export const orgNote = $state<{ off: boolean; open: boolean; access: OrgAccess | null }>({
	off: read(),
	open: false,
	access: null
});

export function setOrgNoteOff(off: boolean) {
	orgNote.off = off;
	if (off) orgNote.open = false;
	try {
		if (off) localStorage.setItem(KEY, '1');
		else localStorage.removeItem(KEY);
	} catch {
		// Private mode: the choice lasts for this page only.
	}
}

export async function loadOrgs(): Promise<OrgAccess> {
	orgNote.access = await api.orgs();
	return orgNote.access;
}

/** Just signed in: show the note with the list, unless this browser said "Don't show again". */
export async function openOrgNote() {
	if (orgNote.off) return;
	if ((await loadOrgs()).available) orgNote.open = true;
}
