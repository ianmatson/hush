import { DEFAULT_SETTINGS } from '$lib/shared/settings';
import { mergeSettings, type SettingsPatch } from '$lib/shared/settings-schema';
import type { Settings } from '$lib/shared/types';

export interface SettingsSave {
	patch: SettingsPatch;
	replace: boolean;
}

const savesTheServerHasNotAnswered: SettingsSave[] = [];

export function settingsAfter(settings: Settings, save: SettingsSave): Settings {
	return mergeSettings(save.replace ? DEFAULT_SETTINGS : settings, save.patch);
}

export function withUnsavedSettings(serverSettings: Settings): Settings {
	return savesTheServerHasNotAnswered.reduce(settingsAfter, serverSettings);
}

export function holdUntilAnswered(save: SettingsSave): () => void {
	savesTheServerHasNotAnswered.push(save);
	return () => {
		const index = savesTheServerHasNotAnswered.indexOf(save);
		if (index >= 0) savesTheServerHasNotAnswered.splice(index, 1);
	};
}
