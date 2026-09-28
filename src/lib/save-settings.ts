import { toast } from 'svelte-sonner';
import { api } from '$lib/api';
import { keys, queryClient, setSettings } from '$lib/queries';
import type { Settings } from '$lib/shared/types';

/**
 * Save a settings patch and update the cache; throws the server's error. With `replace`, the
 * patch is all your changes (settings.json, an imported file). Returns a note for the toast.
 */
export async function applySettings(patch: Partial<Settings>, replace = false): Promise<string> {
	const res = await (replace ? api.replaceSettings(patch) : api.saveSettings(patch));
	setSettings(res.settings);
	// Rules and the turn settings place items again; new searches find more.
	queryClient.invalidateQueries({ queryKey: keys.itemsAll });
	return res.replaced ? ` ${res.replaced} ${res.replaced === 1 ? 'item' : 'items'} moved.` : '';
}

/** Save a settings patch and report the result in a toast. */
export async function saveSettings(
	patch: Partial<Settings>,
	message = 'Saved',
	replace = false
): Promise<boolean> {
	try {
		const note = await applySettings(patch, replace);
		toast.success(note ? `${message}.${note}` : message);
		return true;
	} catch (err) {
		toast.error((err as Error).message);
		return false;
	}
}
