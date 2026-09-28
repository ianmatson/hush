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
import { textMatches } from './text-match';
import { activityText, latestActivity } from './activity';
import { computeTurn, turnFactsFromEnrichment } from './dashboard';

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
export function classifyDefault(
	t: ThreadFacts,
	settings: Pick<Settings, 'botsAreFyi' | 'teamReviewsAreAction'> &
		Partial<Pick<Settings, 'reviewResolution'>>
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
			botsAreFyi: settings.botsAreFyi,
			reviewResolution: settings.reviewResolution
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

export function ruleMatches(m: RuleMatch, t: ThreadFacts, c: Classification): boolean {
	const e = t.enrichment;
	if (!matchGlobs(t.repo, m.repo)) return false;
	if (m.reason && !m.reason.includes(t.reason)) return false;
	if (m.type && !m.type.includes(t.subjectType)) return false;
	if (!matchGlobs(e?.author, m.author)) return false;
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
		if (!matchGlobs(a?.by ?? undefined, m.by)) return false;
		if (m.byBot !== undefined && m.byBot !== !!a?.bot) return false;
	}
	return true;
}

/** Index of the first enabled rule that matches (the one that wins), or -1. */
export function firstMatchingRule(t: ThreadFacts, rules: Rule[], base: Classification): number {
	return rules.findIndex((r) => r.enabled !== false && ruleMatches(r.when ?? {}, t, base));
}

export function classify(t: ThreadFacts, settings: Settings): Classification {
	const base = classifyDefault(t, settings);
	const i = firstMatchingRule(t, settings.rules, base);
	if (i < 0) return base;
	const rule = settings.rules[i];
	const category: Category = rule.then.category ?? base.category;
	const { push, triage, snoozeHours } = rule.then;
	return { ...base, category, push, triage, snoozeHours, rule: rule.name || `Rule ${i + 1}` };
}

/**
 * Where a rule moves a thread that is in the inbox: to Done, or snoozed for some hours. Null when
 * the rule does not move threads (or no rule matched). Callers apply it only on new activity or
 * when the rule starts to match, so a thread you moved back yourself stays where you put it.
 */
export function ruleTriage(
	c: Classification,
	now = Date.now()
): null | { triage: 'done'; note: string } | { triage: 'snoozed'; until: number; note: string } {
	if (!c.rule || !c.triage) return null;
	const note = `Rule: ${c.rule}`;
	if (c.triage === 'done') return { triage: 'done', note };
	return { triage: 'snoozed', until: now + (c.snoozeHours ?? 24) * 3_600_000, note };
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
	'text',
	'kind',
	'category',
	'bot',
	'label',
	'draft',
	'state',
	'by',
	'byBot'
]);
const STATES = new Set(['open', 'closed', 'merged']);
/** A rule may snooze for 1 hour to 30 days. */
const MAX_SNOOZE_HOURS = 30 * 24;

/** Validate user-supplied rules. Returns an error message, or null when valid. */
export function validateRules(rules: unknown): string | null {
	if (!Array.isArray(rules)) return 'Rules must be a JSON array.';
	for (const [i, r] of rules.entries()) {
		const at = `Rule ${i + 1}`;
		if (typeof r !== 'object' || r === null) return `${at}: must be an object.`;
		const { when, then } = r as Rule;
		if (typeof when !== 'object' || when === null) return `${at}: "when" must be an object.`;
		if (typeof then !== 'object' || then === null) return `${at}: "then" must be an object.`;
		for (const [k, v] of Object.entries(when)) {
			if (!MATCH_KEYS.has(k)) return `${at}: unknown condition "${k}".`;
			// An empty list or text never matches, so the rule would do nothing.
			if ((Array.isArray(v) && !v.length) || (typeof v === 'string' && !v.trim()))
				return `${at}: "${k}" needs a value.`;
		}
		if (then.category !== undefined && !CATEGORIES.has(then.category))
			return `${at}: "then.category" must be action, fyi, or muted.`;
		if (then.push !== undefined && typeof then.push !== 'boolean')
			return `${at}: "then.push" must be true or false.`;
		if (when.state && (!Array.isArray(when.state) || when.state.some((x) => !STATES.has(x))))
			return `${at}: "state" must be a list of open, closed, merged.`;
		if (then.triage !== undefined && then.triage !== 'done' && then.triage !== 'snooze')
			return `${at}: "then.triage" must be done or snooze.`;
		if (
			then.triage === 'snooze' &&
			!(
				Number.isInteger(then.snoozeHours) &&
				then.snoozeHours! >= 1 &&
				then.snoozeHours! <= MAX_SNOOZE_HOURS
			)
		)
			return `${at}: "then.snoozeHours" must be a whole number of hours from 1 to ${MAX_SNOOZE_HOURS}.`;
		if (then.category === undefined && then.push === undefined && then.triage === undefined)
			return `${at}: "then" needs category, push, or triage.`;
	}
	return null;
}
