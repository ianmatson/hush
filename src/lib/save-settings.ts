import { toast } from 'svelte-sonner';
import { api } from '$lib/api';
import { keys, queryClient, setSettings } from '$lib/queries';
import type { Settings } from '$lib/shared/types';

/**
 * Save a settings patch and update the cache; throws the server's error. With `replace`, the
 * patch is all your changes (settings.json, an imported file).
 */
export async function applySettings(patch: Partial<Settings>, replace = false): Promise<void> {
	const res = await (replace ? api.replaceSettings(patch) : api.saveSettings(patch));
	setSettings(res.settings);
	if (patch.dash || replace) queryClient.invalidateQueries({ queryKey: keys.dashAll });
}

/** Save a settings patch and report the result in a toast. */
export async function saveSettings(
	patch: Partial<Settings>,
	message = 'Saved',
	replace = false
): Promise<boolean> {
	try {
		await applySettings(patch, replace);
		toast.success(message);
		return true;
	} catch (err) {
		toast.error((err as Error).message);
		return false;
	}
}
