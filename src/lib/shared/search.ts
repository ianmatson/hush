import { compileQuery, ruleMatches } from './place';
import { parseQuery } from './query';
import type { ItemDTO, RuleMatch, SavedSearch } from './types';

/** Saved searches: tabs after the lanes. */
export const MAX_SAVED = 12;

/** The lanes that can be a feed, and their names. Saved searches are 's:<id>'. */
export const FEED_LANES: { id: string; label: string }[] = [
	{ id: 'turn', label: 'Your turn' },
	{ id: 'waiting', label: 'Waiting' },
	{ id: 'updates', label: 'Updates' }
];
export const feedViewOk = (view: string) =>
	FEED_LANES.some((t) => t.id === view) || /^s:[a-z0-9]{1,16}$/.test(view);

/**
 * Does an item match a query's conditions (a saved search, or the search box)? The words mean the
 * same as in rules; `in:` is the item's lane now, and `is:done` (…) what you did with it.
 */
export function itemMatches(when: RuleMatch, t: ItemDTO, me: string): boolean {
	return ruleMatches(
		when,
		{
			repo: t.repo,
			subjectType: t.subjectType,
			title: t.title,
			reason: t.eventKey ?? '',
			htmlUrl: t.url,
			me,
			activity: t.activity,
			enrichment: {
				kind: 'other',
				author: t.author ?? undefined,
				authorIsBot: t.authorIsBot,
				labels: t.labels,
				draft: t.draft,
				state: t.prState ?? undefined
			}
		},
		{ lane: t.lane, kind: t.needs, state: t.state }
	);
}

/** Items that match a query string. */
export const searchItems = (items: ItemDTO[], query: string, me: string) => {
	const when = compileQuery(query);
	return items.filter((t) => itemMatches(when, t, me));
};

/** Validate saved searches. Returns an error message, or null. */
export function validateSaved(saved: unknown): string | null {
	if (!Array.isArray(saved)) return '"saved" must be a list.';
	if (saved.length > MAX_SAVED) return `Up to ${MAX_SAVED} saved searches are allowed.`;
	const ids = new Set<string>();
	for (const v of saved as SavedSearch[]) {
		if (typeof v?.id !== 'string' || !/^[a-z0-9]{1,16}$/.test(v.id))
			return 'Each saved search needs an id: 1 to 16 lower-case letters or digits.';
		if (ids.has(v.id)) return 'Two saved searches have the same id.';
		ids.add(v.id);
		if (typeof v.name !== 'string' || !v.name.trim() || v.name.length > 40)
			return 'Each saved search needs a name (40 characters or fewer).';
		if (typeof v.query !== 'string' || v.query.length > 300)
			return `"${v.name}": the query must be text of 300 characters or fewer.`;
		const err = parseQuery(v.query).errors[0];
		if (err) return `"${v.name}": ${err}`;
	}
	return null;
}
