/**
 * Notes you chose "Don't show again" for, such as "acme has not approved Hush" after
 * sign-in. A note for this browser (localStorage), not a setting; each note has its own key,
 * so a note about another org still shows.
 */
const KEY = 'hush:dismissed-notes';

function read(): string[] {
	try {
		const list: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
		return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
	} catch {
		return [];
	}
}

export const dismissedNotes = $state({ keys: read() });

export function dismissNote(key: string) {
	if (dismissedNotes.keys.includes(key)) return;
	dismissedNotes.keys = [...dismissedNotes.keys, key];
	try {
		localStorage.setItem(KEY, JSON.stringify(dismissedNotes.keys));
	} catch {
		// Private mode: the choice lasts for this page only.
	}
}
