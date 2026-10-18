import type { Enrichment, ReviewWord, RuleFacts, RuleMatch } from './types';
import { ciWord } from './ci';
import { textMatches } from './text-match';
import { latestActivity } from './activity';
import { compileExpr, dateMatches, exprMatches, ME, numberMatches } from './query';
import { conditionId } from './decisions';

/** Convert a simple glob (only `*` and `?`) to a case-insensitive regex. */
export function globToRegExp(glob: string): RegExp {
	const src = glob
		.split('')
		.map((c) => (c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.+^${}()|[\]\\/]/g, '\\$&')))
		.join('');
	return new RegExp(`^${src}$`, 'i');
}

function matchGlobs(value: string | undefined, globs: string | string[] | undefined): boolean {
	if (globs === undefined) return true;
	if (!value) return false;
	const list = Array.isArray(globs) ? globs : [globs];
	return list.some((g) => globToRegExp(g).test(value));
}

function withMe(globs: string | string[] | undefined, me: string): string[] | undefined {
	if (globs === undefined) return undefined;
	return (Array.isArray(globs) ? globs : [globs]).map((g) => (g.toLowerCase() === ME ? me : g));
}

function loginOrBotMatches(
	login: string | null | undefined,
	loginIsBot: boolean,
	globs: string[] | undefined,
	anyBot: boolean | undefined
): boolean {
	const loginMatches = matchGlobs(login ?? undefined, globs);
	if (anyBot === true) return loginIsBot || (globs !== undefined && loginMatches);
	if (anyBot === false && loginIsBot) return false;
	return loginMatches;
}

function reviewIs(word: ReviewWord, e: Enrichment | null): boolean {
	if (e?.kind !== 'pr') return false;
	if (word === 'none') return !e.reviewed;
	if (word === 'required') return e.reviewDecision === 'REVIEW_REQUIRED';
	if (word === 'approved') return e.reviewDecision === 'APPROVED';
	return e.reviewDecision === 'CHANGES_REQUESTED';
}

function githubFactsMatch(m: RuleMatch, t: RuleFacts): boolean {
	const e = t.enrichment;
	const now = t.now ?? Date.now();
	if (!matchGlobs(t.repo.split('/')[0], withMe(m.org, t.me))) return false;
	if (m.review?.length && !m.review.some((word) => reviewIs(word, e))) return false;
	const ci = ciWord(e?.ci);
	if (m.ci?.length && !(ci && m.ci.includes(ci))) return false;
	if (m.comments?.length && !m.comments.some((spec) => numberMatches(spec, e?.comments ?? 0)))
		return false;
	if (m.created?.length && !m.created.some((spec) => dateMatches(spec, e?.createdAt, now)))
		return false;
	if (m.updated?.length && !m.updated.some((spec) => dateMatches(spec, e?.updatedAt, now)))
		return false;
	if (m.no?.includes('label') && e?.labels?.length) return false;
	if (m.no?.includes('assignee') && e?.assignees?.length) return false;
	return true;
}

const hasCategory = (globs: string[], t: RuleFacts) =>
	!!t.categories?.some((name) => matchGlobs(name, globs));

export function ruleMatches(m: RuleMatch, t: RuleFacts): boolean {
	const e = t.enrichment;
	if (!matchGlobs(t.repo, m.repo)) return false;
	if (!githubFactsMatch(m, t)) return false;
	if (m.category?.length && !hasCategory(m.category, t)) return false;
	if (m.type && !m.type.includes(t.subjectType)) return false;
	if (!loginOrBotMatches(e?.author, !!e?.authorIsBot, withMe(m.author, t.me), m.bot)) return false;
	if (m.assignee !== undefined) {
		const assignees = e?.assignees ?? (e?.assignedToMe ? [t.me] : []);
		const wanted = withMe(m.assignee, t.me);
		if (!assignees.some((a) => matchGlobs(a, wanted))) return false;
	}
	if (m.reviewRequested?.length) {
		const requested = e?.reviewRequests ?? (e?.reviewRequestedFromMe ? [t.me] : []);
		const wanted = withMe(m.reviewRequested, t.me);
		if (!requested.some((r) => matchGlobs(r, wanted))) return false;
	}
	if (m.size?.length) {
		if (e?.additions === undefined) return false;
		const lines = e.additions + (e.deletions ?? 0);
		if (!m.size.some((spec) => numberMatches(spec, lines))) return false;
	}
	if (!textMatches(m.text, [t.title, t.repo, e?.author])) return false;
	if (m.label && !e?.labels?.some((label) => matchGlobs(label, m.label))) return false;
	if (m.draft !== undefined && m.draft !== !!e?.draft) return false;
	if (m.state && !(e?.state && m.state.includes(e.state))) return false;
	if (m.by !== undefined || m.byBot !== undefined) {
		const a = t.activity !== undefined ? t.activity : latestActivity(e);
		if (!loginOrBotMatches(a?.by, !!a?.bot, withMe(m.by, t.me), m.byBot)) return false;
	}
	if (m.about?.length) {
		const smart = e?.smart ?? [];
		if (!m.about.some((text) => smart.includes(conditionId(text)))) return false;
	}
	return true;
}

export function queryMatches(query: string, t: RuleFacts): boolean {
	return exprMatches(compileExpr(query), (when) => ruleMatches(when, t));
}
