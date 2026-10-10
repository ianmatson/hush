import type { RuleFacts, RuleMatch } from './types';
import { isBot } from './bots';
import { textMatches } from './text-match';
import { latestActivity } from './activity';
import { compileExpr, exprMatches, ME, sizeMatches } from './query';
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

export function ruleMatches(m: RuleMatch, t: RuleFacts): boolean {
	const e = t.enrichment;
	if (!matchGlobs(t.repo, m.repo)) return false;
	if (m.type && !m.type.includes(t.subjectType)) return false;
	if (!matchGlobs(e?.author, withMe(m.author, t.me))) return false;
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
	if (m.view?.length && !t.views?.some((name) => matchGlobs(name, m.view))) return false;
	if (m.size?.length) {
		if (e?.additions === undefined) return false;
		const lines = e.additions + (e.deletions ?? 0);
		if (!m.size.some((spec) => sizeMatches(spec, lines))) return false;
	}
	if (!textMatches(m.text, [t.title, t.repo, e?.author])) return false;
	if (m.bot !== undefined && m.bot !== !!(e?.authorIsBot || isBot(e?.author))) return false;
	if (m.label && !m.label.some((l) => e?.labels?.some((x) => x.toLowerCase() === l.toLowerCase())))
		return false;
	if (m.draft !== undefined && m.draft !== !!e?.draft) return false;
	if (m.state && !(e?.state && m.state.includes(e.state))) return false;
	if (m.by !== undefined || m.byBot !== undefined) {
		const a = t.activity !== undefined ? t.activity : latestActivity(e);
		if (!matchGlobs(a?.by ?? undefined, withMe(m.by, t.me))) return false;
		if (m.byBot !== undefined && m.byBot !== !!a?.bot) return false;
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
