import type { ReactionContent, Reactions } from './types';

/** GitHub's eight reactions, in GitHub's order. */
export const REACTIONS: { content: ReactionContent; emoji: string; label: string }[] = [
	{ content: 'THUMBS_UP', emoji: '👍', label: 'Thumbs up' },
	{ content: 'THUMBS_DOWN', emoji: '👎', label: 'Thumbs down' },
	{ content: 'LAUGH', emoji: '😄', label: 'Laugh' },
	{ content: 'HOORAY', emoji: '🎉', label: 'Hooray' },
	{ content: 'CONFUSED', emoji: '😕', label: 'Confused' },
	{ content: 'HEART', emoji: '❤️', label: 'Heart' },
	{ content: 'ROCKET', emoji: '🚀', label: 'Rocket' },
	{ content: 'EYES', emoji: '👀', label: 'Eyes' }
];

export const REACTION_CONTENTS = new Set<string>(REACTIONS.map((r) => r.content));

const ORDER = Object.fromEntries(REACTIONS.map((r, i) => [r.content, i]));

/** The groups after you add (or remove) your reaction: counts change, empty groups go. */
export function toggled(r: Reactions, content: ReactionContent): Reactions['groups'] {
	const g = r.groups.find((x) => x.content === content);
	if (!g) return [...r.groups, { content, count: 1, mine: true }].sort(byOrder);
	return r.groups
		.map((x) =>
			x.content === content ? { ...x, mine: !x.mine, count: x.count + (x.mine ? -1 : 1) } : x
		)
		.filter((x) => x.count > 0);
}

const byOrder = (a: { content: string }, b: { content: string }) =>
	ORDER[a.content] - ORDER[b.content];

/** GitHub's reactionGroups, as Hush keeps them (only groups with a reaction). */
export function reactionsOf(n: {
	id?: string;
	viewerCanReact?: boolean;
	reactionGroups?: {
		content: string;
		viewerHasReacted: boolean;
		reactors?: { totalCount: number };
	}[];
}): Reactions | undefined {
	if (!n.id) return undefined;
	return {
		id: n.id,
		canReact: !!n.viewerCanReact,
		groups: (n.reactionGroups ?? [])
			.filter((g) => REACTION_CONTENTS.has(g.content) && (g.reactors?.totalCount ?? 0) > 0)
			.map((g) => ({
				content: g.content as ReactionContent,
				count: g.reactors!.totalCount,
				mine: g.viewerHasReacted
			}))
			.sort(byOrder)
	};
}

/** The GraphQL fields that reactionsOf reads. */
export const REACTION_FIELDS = `id viewerCanReact reactionGroups { content viewerHasReacted reactors { totalCount } }`;
