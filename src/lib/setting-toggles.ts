import type { DashSettings, Settings } from '$lib/shared/types';
import { PUSH_FACTS, type PushFact } from '$lib/shared/push-facts';

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

function pushFact(f: { id: PushFact; label: string }): SettingToggle {
	return {
		key: `pushFacts.${f.id}`,
		label: `Push: ${f.label.charAt(0).toLowerCase()}${f.label.slice(1)}`,
		keywords: ['push', 'notifications', 'alerts', ...f.id.split('-')],
		isOn: (s) => s.pushFacts.includes(f.id),
		patch: (s, on) => ({
			pushFacts: on ? [...new Set([...s.pushFacts, f.id])] : s.pushFacts.filter((x) => x !== f.id)
		})
	};
}

export const SETTING_TOGGLES: SettingToggle[] = [
	topLevel('botsAreFyi', 'Bot activity is FYI', 'bots dependabot renovate inbox'),
	topLevel('teamReviewsAreAction', 'Team review requests need me', 'teams reviews inbox'),
	topLevel('smartDecisions', 'Smart decisions', 'jev ai comments'),
	topLevel('peekMarksRead', 'Peek marks threads as read', 'peek read unread'),
	topLevel('pushUrgentNow', 'Push blocking items at once', 'push urgent digest'),
	topLevel('pushWhileOpen', 'Push while Hush is open', 'push notifications'),
	dash('hideBots', 'Hide PRs and issues that bots opened', 'bots dependabot renovate apps'),
	dash('hideOthersDrafts', 'Hide drafts that others opened', 'drafts pull requests'),
	...PUSH_FACTS.map(pushFact)
];
