import { toast } from 'svelte-sonner';
import { api } from '$lib/api';
import { keys, queryClient, setSettings } from '$lib/queries';
import type { Settings } from '$lib/shared/types';

/** Save a settings patch, update the cache, and report the result. */
export async function saveSettings(patch: Partial<Settings>, message = 'Saved'): Promise<boolean> {
	try {
		const res = await api.saveSettings(patch);
		setSettings(res.settings);
		// Rules and team settings re-sort stored threads; dashboard settings change the searches.
		if (res.reclassified) queryClient.invalidateQueries({ queryKey: keys.threadsAll });
		if (patch.dash) queryClient.invalidateQueries({ queryKey: keys.dashAll });
		toast.success(
			res.reclassified ? `${message}. ${res.reclassified} threads changed category.` : message
		);
		return true;
	} catch (err) {
		toast.error((err as Error).message);
		return false;
	}
}
