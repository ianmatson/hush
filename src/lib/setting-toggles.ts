import type { DashSettings, Settings } from '$lib/shared/types';
import { PUSH_FACTS, type PushFact } from '$lib/shared/push-facts';
import { saveSettings, togglePushFact } from '$lib/save-settings';

type BooleanKeys<T> = { [K in keyof T]: T[K] extends boolean ? K : never }[keyof T];

export interface SettingToggle {
	key: string;
	label: string;
	keywords: string[];
	isOn: (s: Settings) => boolean;
	save: (on: boolean, message: string) => Promise<boolean>;
}

function topLevel(key: BooleanKeys<Settings>, label: string, keywords: string): SettingToggle {
	return {
		key,
		label,
		keywords: keywords.split(' '),
		isOn: (s) => s[key],
		save: (on, message) => saveSettings({ [key]: on }, message)
	};
}

function dash(key: BooleanKeys<DashSettings>, label: string, keywords: string): SettingToggle {
	return {
		key: `dash.${key}`,
		label,
		keywords: keywords.split(' '),
		isOn: (s) => s.dash[key],
		save: (on, message) => saveSettings({ dash: { [key]: on } }, message)
	};
}

function pushFact(f: { id: PushFact; label: string }): SettingToggle {
	return {
		key: `pushFacts.${f.id}`,
		label: `Push: ${f.label.charAt(0).toLowerCase()}${f.label.slice(1)}`,
		keywords: ['push', 'notifications', 'alerts', ...f.id.split('-')],
		isOn: (s) => s.pushFacts.includes(f.id),
		save: (on, message) => togglePushFact(f.id, on, message)
	};
}

export const SETTING_TOGGLES: SettingToggle[] = [
	topLevel('smartDecisions', 'Smart decisions', 'jev ai comments categories'),
	topLevel('pushUrgentNow', 'Push blocking items at once', 'push urgent digest'),
	topLevel('pushWhileOpen', 'Push while Hush is open', 'push notifications'),
	dash('hideBots', 'Hide PRs and issues that bots opened', 'bots dependabot renovate apps'),
	dash('hideOthersDrafts', 'Hide drafts that others opened', 'drafts pull requests'),
	...PUSH_FACTS.map(pushFact)
];
