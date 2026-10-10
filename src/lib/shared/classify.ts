import type {
	ActionKind,
	Category,
	Classification,
	RuleMatch,
	Settings,
	ThreadFacts
} from './types';
import { isBot } from './bots';
import { textMatches } from './text-match';
import { activityText, latestActivity } from './activity';
import { computeTurn, turnFactsFromEnrichment } from './dashboard';
import { compileExpr, exprMatches, ME, sizeMatches } from './query';
import { conditionId } from './decisions';

/** Notification reasons, as Hush shows them. */
export const WHY: Record<string, string> = {
	approval_requested: 'Deployment approval requested',
	assign: 'Assigned to you',
	author: 'You opened this',
	comment: 'You commented',
	ci_activity: 'Your workflow run',
	invitation: 'Repository invitation',
	manual: 'You subscribed',
	member_feature_requested: 'Feature request',
	mention: 'You were mentioned',
	review_requested: 'Review requested',
	security_alert: 'Security alert',
	security_advisory_credit: 'Advisory credit',
	state_change: 'State changed',
	subscribed: 'Watching repo',
	team_mention: 'Team mentioned'
};

export { isBot };

/** The default, opinionated classification: only things you can act on are "action". */
export function classify(
	t: ThreadFacts,
	settings: Pick<Settings, 'botsAreFyi' | 'teamReviewsAreAction'> &
		Partial<Pick<Settings, 'reviewResolution' | 'newCommitsAfterReview'>>
): Classification {
	const e = t.enrichment;
	const me = t.me.toLowerCase();
	const url = e?.url || t.htmlUrl;
	const why = WHY[t.reason] ?? t.reason.replace(/_/g, ' ');
	const lastBy = e?.lastComment?.author;
	const lastByOther = !!lastBy && lastBy.toLowerCase() !== me;
	const lastByHuman = lastByOther && !(settings.botsAreFyi && e?.lastComment?.authorIsBot);
	const noReplyNeeded = e?.commentsNeedMe === false;

	const act = (
		kind: ActionKind,
		summary: string,
		actionLabel: string,
		actionUrl = url
	): Classification => ({
		category: 'action',
		kind,
		summary,
		why,
		actionLabel,
		actionUrl
	});
	const fyi = (summary: string): Classification => ({
		category: 'fyi',
		kind: 'none',
		summary,
		why,
		actionLabel: 'Open',
		actionUrl: e?.lastComment?.url || url
	});

	// A mention can be in the body (no comment yet) or in the latest comment.
	const mention = (where: string): Classification => {
		const c = e?.lastComment;
		if (!c)
			return act(
				'reply',
				`You were mentioned in a${where === 'issue' ? 'n' : ''} ${where}`,
				'Reply',
				url
			);
		if (!lastByOther) return fyi('You replied to a mention');
		if (settings.botsAreFyi && c.authorIsBot) return fyi(`@${lastBy} mentioned you`);
		if (noReplyNeeded) return fyi(`@${lastBy} mentioned you (no reply needed)`);
		return act('reply', `@${lastBy} mentioned you`, 'Reply', c.url || url);
	};

	if (t.reason === 'security_alert') return act('security', 'Security alert', 'View alert');
	if (t.reason === 'invitation') return act('triage', 'You were invited to a repository', 'View');
	if (t.reason === 'approval_requested')
		return act('review', 'A deployment waits for your approval', 'Approve');

	if (e?.kind === 'pr' || e?.kind === 'issue') {
		const pr = e.kind === 'pr';
		const mine = e.author?.toLowerCase() === me;
		if (e.state === 'merged') return fyi(mine ? 'Your PR was merged' : 'PR merged');
		if (e.state === 'closed')
			return fyi(pr ? (mine ? 'Your PR was closed' : 'PR closed') : 'Issue closed');

		// Whose turn: the same rules as the PR and issue dashboards.
		const turn = computeTurn(turnFactsFromEnrichment(e, t.repo, t.me, t.myTeams), t.me, [], {
			botsAreFyi: settings.botsAreFyi,
			reviewResolution: settings.reviewResolution,
			newCommitsAfterReview: settings.newCommitsAfterReview
		});
		if (turn.turn === 'you') return act(turn.kind, turn.summary, turn.actionLabel, turn.actionUrl);
		if (turn.turn === 'team' && settings.teamReviewsAreAction)
			return act('review', turn.summary, turn.actionLabel, turn.actionUrl);

		// Conversations you are in, which the dashboards do not track.
		if (t.reason === 'mention') return mention(pr ? 'PR' : 'issue');
		if (t.reason === 'comment' && !mine && lastByHuman && !noReplyNeeded)
			return act(
				'reply',
				`@${lastBy} replied in ${pr ? 'a PR' : 'an issue'} thread`,
				'Reply',
				e.lastComment?.url || url
			);
		if (t.reason === 'team_mention') return fyi('Your team was mentioned');
		if (t.reason === 'review_requested' && pr && !mine)
			return fyi('Review request no longer pending');
		// Say what happened, not only that something did (the notification does not say).
		const a = latestActivity(e);
		const subject = pr
			? mine
				? e.draft
					? 'your draft PR'
					: 'your PR'
				: 'this PR'
			: mine
				? 'your issue'
				: 'this issue';
		if (a) return fyi(activityText(a, t.me, subject));
		if (!pr) return fyi('Issue activity');
		return fyi(
			mine ? (e.draft ? 'Activity on your draft PR' : 'Activity on your PR') : 'PR activity'
		);
	}

	// Subjects without enrichment.
	switch (t.subjectType) {
		case 'CheckSuite':
			return /fail|cancel|timed out/i.test(t.title)
				? act('fix_ci', 'A workflow run failed', 'View run')
				: fyi('Workflow run finished');
		case 'Release':
			return fyi('New release');
		case 'Discussion':
			return t.reason === 'mention'
				? act('reply', 'You were mentioned in a discussion', 'Reply')
				: fyi('Discussion activity');
		case 'RepositoryVulnerabilityAlert':
		case 'RepositoryDependabotAlertsThread':
			return act('security', 'Dependency vulnerability alert', 'View alert');
		default:
			return t.reason === 'mention' || t.reason === 'assign'
				? act('reply', why, 'Open')
				: fyi(`${t.subjectType} activity`);
	}
}

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

export function ruleMatches(m: RuleMatch, t: ThreadFacts, c: Classification): boolean {
	const e = t.enrichment;
	if (!matchGlobs(t.repo, m.repo)) return false;
	if (m.reason && !m.reason.includes(t.reason)) return false;
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
	const named = (mark: { id: string; name: string }, globs: string[]) =>
		matchGlobs(mark.id, globs) || matchGlobs(mark.name, globs);
	if (m.itemCategory?.length && !t.itemCategories?.some((x) => named(x, m.itemCategory!)))
		return false;
	if (m.size?.length) {
		if (e?.additions === undefined) return false;
		const lines = e.additions + (e.deletions ?? 0);
		if (!m.size.some((spec) => sizeMatches(spec, lines))) return false;
	}
	if (!textMatches(m.text, [t.title, t.repo, e?.author])) return false;
	if (m.kind && !m.kind.includes(c.kind)) return false;
	if (m.category && !m.category.includes(c.category)) return false;
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

export function queryMatches(query: string, t: ThreadFacts, c: Classification): boolean {
	return exprMatches(compileExpr(query), (when) => ruleMatches(when, t, c));
}

/**
 * "Doesn't need me — only this one": a thread you took out of Needs you is FYI until it changes
 * (a new notification moves its updatedAt past `override_updated_at`).
 */
export function withOverride(
	c: Classification,
	row: { override: string | null; override_updated_at: string | null } | null | undefined,
	updatedAt: string
): Classification {
	if (row?.override !== 'fyi' || row.override_updated_at !== updatedAt || c.category !== 'action')
		return c;
	return { ...c, category: 'fyi', push: false };
}
