import type {
	ActionKind,
	Category,
	Classification,
	Rule,
	RuleMatch,
	Settings,
	ThreadFacts
} from './types';
import { isBot } from './bots';
import { computeTurn, turnFactsFromEnrichment } from './dashboard';

const WHY: Record<string, string> = {
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
export function classifyDefault(
	t: ThreadFacts,
	settings: Pick<Settings, 'botsAreFyi' | 'teamReviewsAreAction'>
): Classification {
	const e = t.enrichment;
	const me = t.me.toLowerCase();
	const url = e?.url || t.htmlUrl;
	const why = WHY[t.reason] ?? t.reason.replace(/_/g, ' ');
	const lastBy = e?.lastComment?.author;
	const lastByOther = !!lastBy && lastBy.toLowerCase() !== me;
	const lastByHuman = lastByOther && !(settings.botsAreFyi && e?.lastComment?.authorIsBot);

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
			botsAreFyi: settings.botsAreFyi
		});
		if (turn.turn === 'you') return act(turn.kind, turn.summary, turn.actionLabel, turn.actionUrl);
		if (turn.turn === 'team' && settings.teamReviewsAreAction)
			return act('review', turn.summary, turn.actionLabel, turn.actionUrl);

		// Conversations you are in, which the dashboards do not track.
		if (t.reason === 'mention') return mention(pr ? 'PR' : 'issue');
		if (t.reason === 'comment' && !mine && lastByHuman)
			return act(
				'reply',
				`@${lastBy} replied in ${pr ? 'a PR' : 'an issue'} thread`,
				'Reply',
				e.lastComment?.url || url
			);
		if (t.reason === 'team_mention') return fyi('Your team was mentioned');
		if (!pr) return fyi('Issue activity');
		if (mine) return fyi(e.draft ? 'Activity on your draft PR' : 'Activity on your PR');
		if (t.reason === 'review_requested') return fyi('Review request no longer pending');
		return fyi('PR activity');
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

export function ruleMatches(m: RuleMatch, t: ThreadFacts, c: Classification): boolean {
	const e = t.enrichment;
	if (!matchGlobs(t.repo, m.repo)) return false;
	if (m.reason && !m.reason.includes(t.reason)) return false;
	if (m.type && !m.type.includes(t.subjectType)) return false;
	if (!matchGlobs(e?.author, m.author)) return false;
	if (m.titleContains && !t.title.toLowerCase().includes(m.titleContains.toLowerCase()))
		return false;
	if (m.kind && !m.kind.includes(c.kind)) return false;
	if (m.category && !m.category.includes(c.category)) return false;
	if (m.bot !== undefined && m.bot !== !!(e?.authorIsBot || isBot(e?.author))) return false;
	if (m.label && !m.label.some((l) => e?.labels?.some((x) => x.toLowerCase() === l.toLowerCase())))
		return false;
	if (m.draft !== undefined && m.draft !== !!e?.draft) return false;
	return true;
}

export function classify(t: ThreadFacts, settings: Settings): Classification {
	const base = classifyDefault(t, settings);
	for (const [i, rule] of settings.rules.entries()) {
		if (rule.enabled === false) continue;
		if (!ruleMatches(rule.when ?? {}, t, base)) continue;
		const category: Category = rule.then.category ?? base.category;
		return {
			...base,
			category,
			push: rule.then.push,
			rule: rule.name || `Rule ${i + 1}`
		};
	}
	return base;
}

export function shouldPush(c: Classification, settings: Settings): boolean {
	if (c.push !== undefined) return c.push;
	if (c.category === 'action') return settings.pushAction;
	if (c.category === 'fyi') return settings.pushFyi;
	return false;
}

const CATEGORIES = new Set(['action', 'fyi', 'muted']);
const MATCH_KEYS = new Set([
	'repo',
	'reason',
	'type',
	'author',
	'titleContains',
	'kind',
	'category',
	'bot',
	'label',
	'draft'
]);

/** Validate user-supplied rules. Returns an error message, or null when valid. */
export function validateRules(rules: unknown): string | null {
	if (!Array.isArray(rules)) return 'Rules must be a JSON array.';
	for (const [i, r] of rules.entries()) {
		const at = `Rule ${i + 1}`;
		if (typeof r !== 'object' || r === null) return `${at}: must be an object.`;
		const { when, then } = r as Rule;
		if (typeof when !== 'object' || when === null) return `${at}: "when" must be an object.`;
		if (typeof then !== 'object' || then === null) return `${at}: "then" must be an object.`;
		for (const k of Object.keys(when))
			if (!MATCH_KEYS.has(k)) return `${at}: unknown condition "${k}".`;
		if (then.category !== undefined && !CATEGORIES.has(then.category))
			return `${at}: "then.category" must be action, fyi, or muted.`;
		if (then.push !== undefined && typeof then.push !== 'boolean')
			return `${at}: "then.push" must be true or false.`;
		if (then.category === undefined && then.push === undefined)
			return `${at}: "then" needs category or push.`;
	}
	return null;
}
