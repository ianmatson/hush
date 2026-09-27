import { ruleMatches } from './classify';
import type { Classification, RuleMatch, SavedView, ThreadDTO, ViewBase } from './types';

export const VIEW_BASES: { id: ViewBase; label: string }[] = [
	{ id: 'inbox', label: 'Needs you + FYI' },
	{ id: 'action', label: 'Needs you' },
	{ id: 'fyi', label: 'FYI' },
	{ id: 'snoozed', label: 'Snoozed' },
	{ id: 'done', label: 'Done' }
];
export const MAX_VIEWS = 12;

/** The built-in tabs that can be a feed, and their names. Saved views are 'v:<id>'. */
export const FEED_TABS: { id: string; label: string }[] = [
	{ id: 'action', label: 'Needs you' },
	{ id: 'fyi', label: 'FYI' },
	{ id: 'inbox', label: 'Needs you + FYI' }
];
export const feedViewOk = (view: string) =>
	FEED_TABS.some((t) => t.id === view) || /^v:[a-z0-9]{1,16}$/.test(view);

/**
 * Does a thread belong in a saved view (or match the Filter box)? The conditions mean the same as
 * in rules; "category" is the thread's category now (the view's base already picks it).
 */
export function threadMatches(when: RuleMatch, t: ThreadDTO, me: string): boolean {
	const c = { category: t.category, kind: t.kind } as Classification;
	return ruleMatches(
		when,
		{
			repo: t.repo,
			subjectType: t.subjectType,
			title: t.title,
			reason: t.reason,
			htmlUrl: t.htmlUrl,
			me,
			enrichment: {
				kind: 'other',
				author: t.author ?? undefined,
				authorIsBot: t.authorIsBot,
				labels: t.labels,
				draft: t.draft,
				state: t.state ?? undefined
			}
		},
		c
	);
}

/** Validate saved views from the client. Returns an error message, or null. */
export function validateViews(views: unknown, validateWhen: (when: unknown) => string | null) {
	if (!Array.isArray(views)) return 'Views must be a list.';
	if (views.length > MAX_VIEWS) return `Up to ${MAX_VIEWS} views are allowed.`;
	const ids = new Set<string>();
	for (const v of views as SavedView[]) {
		if (typeof v?.id !== 'string' || !/^[a-z0-9]{1,16}$/.test(v.id))
			return 'Each view needs an id.';
		if (ids.has(v.id)) return 'Two views have the same id.';
		ids.add(v.id);
		if (typeof v.name !== 'string' || !v.name.trim() || v.name.length > 40)
			return 'Each view needs a name (40 characters or fewer).';
		if (!VIEW_BASES.some((b) => b.id === v.base)) return `"${v.name}": unknown base.`;
		const err = validateWhen(v.when);
		if (err) return `"${v.name}": ${err}`;
	}
	return null;
}
