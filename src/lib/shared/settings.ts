import { DEFAULT_MENU } from './menus';
import type { Settings, TrackedSearch } from './types';

/**
 * The GitHub searches Hush runs to find items with no recent notification: old review requests,
 * your open PRs, what you reviewed, what is assigned to you. `@me` is you; `@team` runs once for
 * each of your teams.
 */
export const DEFAULT_SEARCHES: TrackedSearch[] = [
	{
		id: 'review-me',
		name: 'Review requested from you',
		query: 'is:pr is:open user-review-requested:@me',
		enabled: true
	},
	{
		id: 'review-team',
		name: 'Review requested from your teams',
		query: 'is:pr is:open team-review-requested:@team',
		enabled: true
	},
	{ id: 'my-prs', name: 'Your open PRs', query: 'is:pr is:open author:@me', enabled: true },
	{
		id: 'reviewed',
		name: 'PRs you reviewed',
		query: 'is:pr is:open reviewed-by:@me -author:@me',
		enabled: true
	},
	{ id: 'assigned', name: 'Assigned to you', query: 'is:open assignee:@me', enabled: true },
	{
		id: 'my-issues',
		name: 'Your open issues',
		query: 'is:issue is:open author:@me',
		enabled: true
	},
	{ id: 'mentions', name: 'Mentions you', query: 'is:open mentions:@me', enabled: false },
	{
		id: 'commented',
		name: 'Issues you commented on',
		query: 'is:issue is:open commenter:@me -author:@me',
		enabled: false
	}
];

export const DEFAULT_SETTINGS: Settings = {
	teamReviewsAreMine: false,
	reviewResolution: 'strict',
	botsAreUpdates: true,
	staleDays: 3,
	rules: [],
	push: true,
	pushResolved: true,
	quietHours: null,
	markReadOnGitHub: true,
	searches: DEFAULT_SEARCHES,
	searchScope: 'archived:false',
	excludedTeams: [],
	saved: [],
	keys: {},
	menu: DEFAULT_MENU
};

/**
 * Merge stored settings over the defaults. New fields get their default value; fields that are
 * gone are dropped.
 */
export function parseSettings(json: string | null | undefined): Settings {
	try {
		const stored = JSON.parse(json || '{}') as Record<string, unknown>;
		const raw = Object.fromEntries(
			Object.entries(stored).filter(([k]) => k in DEFAULT_SETTINGS)
		) as Partial<Settings>;
		return { ...structuredClone(DEFAULT_SETTINGS), ...raw };
	} catch {
		return structuredClone(DEFAULT_SETTINGS);
	}
}
