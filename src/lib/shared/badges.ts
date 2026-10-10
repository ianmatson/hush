import type { Change } from './types';

/**
 * One fact, one badge. A row's headline (the turn reason) already says some facts; the badges after it leave those out, so nothing shows twice.
 */
export type Fact = 'ci' | 'review' | 'threads' | 'conflicts' | 'draft' | 'requested';

const SAYS: [RegExp, Fact][] = [
	[/\bdraft\b/i, 'draft'],
	[/\bCI\b/, 'ci'],
	[/changes requested|ready to merge|is approved/i, 'review'],
	[/conflict/i, 'conflicts'],
	[/open (review )?threads?/i, 'threads'],
	[/review requested|requests (your |a )?(re-)?review/i, 'requested']
];

/** The facts that these texts say. */
export function saidBy(...texts: string[]): Set<Fact> {
	return new Set(SAYS.filter(([re]) => texts.some((t) => re.test(t))).map(([, f]) => f));
}

const CHANGE_FACT: Partial<Record<Change['kind'], Fact>> = {
	ci: 'ci',
	draft: 'draft',
	requested: 'requested'
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The "since you looked" changes that add something to what the row already says. */
export function newChanges(changes: Change[], said: Set<Fact>, texts: string[]): Change[] {
	return changes.filter((c) => {
		const f = CHANGE_FACT[c.kind];
		return !(f && said.has(f)) && !texts.some((t) => same(t, c.text));
	});
}
