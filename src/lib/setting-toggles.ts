import type { DashSettings, Settings } from '$lib/shared/types';

type BooleanKeys<T> = { [K in keyof T]: T[K] extends boolean ? K : never }[keyof T];

export interface SettingToggle {
	key: string;
	label: string;
	keywords: string[];
	isOn: (s: Settings) => boolean;
	patch: (s: Settings, on: boolean) => Partial<Settings>;
}

function topLevel(key: BooleanKeys<Settings>, label: string, keywords: string): SettingToggle {
	return {
		key,
		label,
		keywords: keywords.split(' '),
		isOn: (s) => s[key],
		patch: (_, on) => ({ [key]: on })
	};
}

function dash(key: BooleanKeys<DashSettings>, label: string, keywords: string): SettingToggle {
	return {
		key: `dash.${key}`,
		label,
		keywords: keywords.split(' '),
		isOn: (s) => s.dash[key],
		patch: (s, on) => ({ dash: { ...s.dash, [key]: on } })
	};
}

export const SETTING_TOGGLES: SettingToggle[] = [
	topLevel('botsAreFyi', 'Bot activity is FYI', 'bots dependabot renovate inbox'),
	topLevel('teamReviewsAreAction', 'Team review requests need me', 'teams reviews inbox'),
	topLevel('smartDecisions', 'Smart decisions', 'jev ai comments'),
	topLevel('peekMarksRead', 'Peek marks threads as read', 'peek read unread'),
	topLevel('pushAction', 'Push “Needs you” items', 'push notifications alerts'),
	topLevel('pushFyi', 'Push FYI items', 'push notifications alerts'),
	topLevel('pushUrgentNow', 'Push blocking items at once', 'push urgent digest'),
	topLevel('pushWhileOpen', 'Push while Hush is open', 'push notifications'),
	topLevel('pushTurnChanges', 'Push when it becomes my turn', 'push turn watcher'),
	dash('hideBots', 'Hide PRs and issues that bots opened', 'bots dependabot renovate apps'),
	dash('hideOthersDrafts', 'Hide drafts that others opened', 'drafts pull requests')
];
