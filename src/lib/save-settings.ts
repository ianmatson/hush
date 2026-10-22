import { toast } from 'svelte-sonner';
import { api } from '$lib/api';
import { cachedSettings, keys, queryClient, updateCachedSettings } from '$lib/queries';
import type { PushFact } from '$lib/shared/push-facts';
import { validateSettings, type SettingsPatch } from '$lib/shared/settings-schema';
import type { Settings } from '$lib/shared/types';
import {
	holdUntilAnswered,
	settingsAfter,
	withUnsavedSettings,
	type SettingsSave
} from '$lib/unsaved-settings';

let previousSave: Promise<unknown> = Promise.resolve();

function refuseInvalid(save: SettingsSave) {
	const settings = cachedSettings();
	if (!settings) return;
	const error = validateSettings(settingsAfter(settings, save), Object.keys(save.patch));
	if (error) throw new Error(error);
}

function sendAfterPreviousSave({ patch, replace }: SettingsSave) {
	const sent = previousSave.then(() =>
		replace ? api.replaceSettings(patch) : api.saveSettings(patch)
	);
	previousSave = sent.catch(() => {});
	return sent;
}

async function showServerSettings(serverSettings: Settings) {
	await queryClient.cancelQueries({ queryKey: keys.me });
	updateCachedSettings(() => withUnsavedSettings(serverSettings));
}

/**
 * Save a settings patch and update the cache; throws the server's error. With `replace`, the
 * patch is all your changes (settings.json, an imported file).
 */
export async function applySettings(patch: SettingsPatch, replace = false): Promise<void> {
	const save: SettingsSave = { patch, replace };
	refuseInvalid(save);
	const forgetSave = holdUntilAnswered(save);
	updateCachedSettings((settings) => settingsAfter(settings, save));
	try {
		const { settings } = await sendAfterPreviousSave(save);
		forgetSave();
		await showServerSettings(settings);
	} catch (err) {
		forgetSave();
		void queryClient.invalidateQueries({ queryKey: keys.me });
		throw err;
	}
	if (patch.dash || replace) void queryClient.invalidateQueries({ queryKey: keys.items });
}

export async function saveSettings(
	patch: SettingsPatch,
	successToast?: string,
	replace = false
): Promise<boolean> {
	try {
		await applySettings(patch, replace);
		if (successToast) toast.success(successToast);
		return true;
	} catch (err) {
		toast.error((err as Error).message);
		return false;
	}
}

export function togglePushFact(fact: PushFact, on: boolean, message?: string): Promise<boolean> {
	const facts = cachedSettings()?.pushFacts;
	if (!facts) return Promise.resolve(false);
	const next = on ? [...new Set([...facts, fact])] : facts.filter((f) => f !== fact);
	return saveSettings({ pushFacts: next }, message);
}
