/**
 * The comment box's suggestions, like GitHub's: "@" for people and teams, "#" for issues and
 * pull requests (also "owner/repo#" for another repo). The people in the conversation come
 * first, then the rest of the repo's people; see /api/suggest for where they come from.
 */

export type Trigger =
	| { kind: 'user'; start: number; query: string }
	| { kind: 'ref'; start: number; query: string; repo: string | null };

export interface UserSuggestion {
	kind: 'user';
	/** A login, or "org/team" for a team. */
	login: string;
	name: string | null;
	avatar: string | null;
	team: boolean;
}

export interface RefSuggestion {
	kind: 'ref';
	number: number;
	title: string;
	type: 'pr' | 'issue';
	state: 'open' | 'closed' | 'merged' | 'draft';
	/** Set for another repo than the comment's ("owner/repo#12"). */
	repo: string | null;
}

export type Suggestion = UserSuggestion | RefSuggestion;

const USER = /(?:^|[\s([{])@([A-Za-z0-9-]*(?:\/[A-Za-z0-9_.-]*)?)$/;
const REF = /(?:^|[\s([{])((?:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)?)#([^\s#]*)$/;

/** What you are typing just before the caret, if it asks for a suggestion. */
export function triggerAt(text: string, caret: number): Trigger | null {
	const before = text.slice(0, caret);
	const u = USER.exec(before);
	if (u) return { kind: 'user', start: caret - u[1].length - 1, query: u[1] };
	const r = REF.exec(before);
	if (r) {
		const repo = r[1] || null;
		return {
			kind: 'ref',
			start: caret - r[2].length - 1 - (repo?.length ?? 0),
			query: r[2],
			repo
		};
	}
	return null;
}

/** The text with the pick in place of what you typed, and where the caret goes. */
export function applyPick(
	text: string,
	caret: number,
	t: Trigger,
	s: Suggestion
): { text: string; caret: number } {
	const word =
		s.kind === 'user' ? `@${s.login}` : `${s.repo ? `${s.repo}` : ''}#${String(s.number)}`;
	const after = text.slice(caret);
	const insert = /^\s/.test(after) ? word : `${word} `;
	return {
		text: text.slice(0, t.start) + insert + after,
		caret: t.start + insert.length
	};
}

const MAX = 8;

/**
 * People for "@": the conversation's people first (the author, then the latest to speak), then
 * the repo's, then teams. Matched on the start of the login or of a word in the name. You are not
 * in the list (GitHub leaves you out too).
 */
export function rankUsers(
	participants: UserSuggestion[],
	remote: UserSuggestion[],
	query: string,
	me: string
): UserSuggestion[] {
	const q = query.toLowerCase();
	const meL = me.toLowerCase();
	const hits = (u: UserSuggestion) =>
		!q ||
		u.login.toLowerCase().startsWith(q) ||
		u.login.toLowerCase().split('/')[1]?.startsWith(q) ||
		(u.name ?? '')
			.toLowerCase()
			.split(/\s+/)
			.some((w) => w.startsWith(q));
	const seen = new Set<string>();
	const out: UserSuggestion[] = [];
	const people = [...participants, ...remote.filter((u) => !u.team)];
	for (const u of [...people, ...remote.filter((u) => u.team)]) {
		const k = u.login.toLowerCase();
		if (seen.has(k) || k === meL || !hits(u)) continue;
		seen.add(k);
		out.push(u);
		if (out.length === MAX) break;
	}
	return out;
}

/** Issues and PRs for "#": an exact number first, then the rest in the order given. */
export function rankRefs(refs: RefSuggestion[], query: string): RefSuggestion[] {
	const n = /^\d+$/.test(query) ? Number(query) : null;
	const seen = new Set<number>();
	const out: RefSuggestion[] = [];
	const exact = n === null ? [] : refs.filter((r) => r.number === n);
	for (const r of [...exact, ...refs]) {
		if (seen.has(r.number)) continue;
		seen.add(r.number);
		out.push(r);
	}
	return out.slice(0, MAX);
}
