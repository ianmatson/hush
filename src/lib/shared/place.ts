import type { ActionKind, ItemFacts, Lane, Placement, Rule, RuleMatch, Settings } from './types';
import { isBot } from './bots';
import { textMatches } from './text-match';
import { activityText, latestActivity } from './activity';
import { computeTurn, turnFactsFromEnrichment, type TurnResult } from './turn';
import { turnFactsOf } from './subject';
import { parseQuery } from './query';

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

type PlaceSettings = Pick<
	Settings,
	'botsAreUpdates' | 'teamReviewsAreMine' | 'reviewResolution' | 'rules'
>;

/** Hush's own view of an item, before rules: is it your turn, and what does the row say. */
export interface BaseView {
	/** "turn": you must act. "other": not you (Waiting or Updates, from `turn`). */
	mine: boolean;
	kind: ActionKind;
	summary: string;
	event: string;
	actionLabel: string;
	actionUrl: string;
	/** Whose turn, for PRs and issues. */
	turn: TurnResult | null;
}

/** Hush's opinion, before your rules: only things you can act on are your turn. */
export function baseView(
	t: ItemFacts,
	settings: Pick<Settings, 'botsAreUpdates' | 'teamReviewsAreMine'> &
		Partial<Pick<Settings, 'reviewResolution'>>
): BaseView {
	const e = t.enrichment;
	const me = t.me.toLowerCase();
	const url = e?.url || t.htmlUrl;
	const event = t.reason ? (WHY[t.reason] ?? t.reason.replace(/_/g, ' ')) : '';
	const lastBy = e?.lastComment?.author;
	const lastByOther = !!lastBy && lastBy.toLowerCase() !== me;
	const lastByHuman = lastByOther && !(settings.botsAreUpdates && e?.lastComment?.authorIsBot);
	let turn: TurnResult | null = null;

	const act = (
		kind: ActionKind,
		summary: string,
		actionLabel: string,
		actionUrl = url
	): BaseView => ({
		mine: true,
		kind,
		summary,
		event,
		actionLabel,
		actionUrl,
		turn
	});
	const other = (summary: string): BaseView => ({
		mine: false,
		kind: 'none',
		summary,
		event,
		actionLabel: 'Open',
		actionUrl: e?.lastComment?.url || url,
		turn
	});

	// A mention can be in the body (no comment yet) or in the latest comment.
	const mention = (where: string): BaseView => {
		const c = e?.lastComment;
		if (!c)
			return act(
				'reply',
				`You were mentioned in a${where === 'issue' ? 'n' : ''} ${where}`,
				'Reply',
				url
			);
		if (!lastByOther) return other('You replied to a mention');
		if (settings.botsAreUpdates && c.authorIsBot) return other(`@${lastBy} mentioned you`);
		return act('reply', `@${lastBy} mentioned you`, 'Reply', c.url || url);
	};

	if (t.reason === 'security_alert') return act('security', 'Security alert', 'View alert');
	if (t.reason === 'invitation') return act('triage', 'You were invited to a repository', 'View');
	if (t.reason === 'approval_requested')
		return act('review', 'A deployment waits for your approval', 'Approve');

	if (e?.kind === 'pr' || e?.kind === 'issue') {
		const pr = e.kind === 'pr';
		const mine = e.author?.toLowerCase() === me;
		// Whose turn: the full facts when Hush has them (review-request times), else the enrichment.
		turn = computeTurn(
			t.subject
				? turnFactsOf(t.subject, t.me, new Set(t.myTeams ?? []))
				: turnFactsFromEnrichment(e, t.repo, t.me, t.myTeams),
			t.me,
			[],
			{ botsAreUpdates: settings.botsAreUpdates, reviewResolution: settings.reviewResolution }
		);
		if (e.state === 'merged') return other(mine ? 'Your PR was merged' : 'PR merged');
		if (e.state === 'closed')
			return other(pr ? (mine ? 'Your PR was closed' : 'PR closed') : 'Issue closed');

		if (turn.turn === 'you') return act(turn.kind, turn.summary, turn.actionLabel, turn.actionUrl);
		if (turn.turn === 'team' && settings.teamReviewsAreMine)
			return act('review', turn.summary, turn.actionLabel, turn.actionUrl);

		// Conversations you are in, which the turn rules do not follow.
		if (t.reason === 'mention') return mention(pr ? 'PR' : 'issue');
		if (t.reason === 'comment' && !mine && lastByHuman)
			return act(
				'reply',
				`@${lastBy} replied in ${pr ? 'a PR' : 'an issue'} thread`,
				'Reply',
				e.lastComment?.url || url
			);
		if (turn.turn === 'team') return other(turn.summary);
		if (t.reason === 'team_mention') return other('Your team was mentioned');
		if (t.reason === 'review_requested' && pr && !mine && turn.turn !== 'them')
			return other('Review request no longer pending');
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
		if (turn.turn === 'them') return other(turn.summary);
		if (a) return other(activityText(a, t.me, subject));
		if (!pr) return other('Issue activity');
		return other(
			mine ? (e.draft ? 'Activity on your draft PR' : 'Activity on your PR') : 'PR activity'
		);
	}

	// Subjects without facts.
	switch (t.subjectType) {
		case 'CheckSuite':
			return /fail|cancel|timed out/i.test(t.title)
				? act('fix_ci', 'A workflow run failed', 'View run')
				: other('Workflow run finished');
		case 'Release':
			return other('New release');
		case 'Discussion':
			return t.reason === 'mention'
				? act('reply', 'You were mentioned in a discussion', 'Reply')
				: other('Discussion activity');
		case 'RepositoryVulnerabilityAlert':
		case 'RepositoryDependabotAlertsThread':
			return act('security', 'Dependency vulnerability alert', 'View alert');
		default:
			return t.reason === 'mention' || t.reason === 'assign'
				? act('reply', event, 'Open')
				: other(`${t.subjectType} activity`);
	}
}

/** Someone else waits on you for these; the rest is your own work. */
const OTHERS_WAIT: ActionKind[] = ['review', 'reply', 'none'];

/** On whom an item waits, from its turn: "@dave", "acme/web-core", or "CI". */
function waitingOnOf(t: ItemFacts, turn: TurnResult): string | null {
	const s = t.subject;
	if (turn.turn === 'team') return turn.turnReason.replace(/^Review for /, '') || null;
	if (turn.turn !== 'them') return null;
	if (turn.turnReason === 'CI running') return 'CI';
	const people = (s?.reviewRequests ?? []).map((r) => (r.team ? r.name : `@${r.name}`));
	if (turn.turnReason === 'Waiting for review') return people.length ? people.join(', ') : null;
	const author = s?.author ?? t.enrichment?.author;
	if (author && author.toLowerCase() !== t.me.toLowerCase()) return `@${author}`;
	return null;
}

/**
 * Where an item goes: Hush's view, then your rules (the first enabled rule that matches wins).
 * Your turn when you must act; Waiting when someone else must act on work you are part of;
 * Updates for everything else.
 */
export function place(
	t: ItemFacts,
	settings: PlaceSettings,
	rules = compileRules(settings.rules)
): Placement {
	const base = baseView(t, settings);
	const turn = base.turn;
	const own: Lane = base.mine
		? 'turn'
		: turn && (turn.turn === 'them' || turn.turn === 'team')
			? 'waiting'
			: 'updates';
	const i = firstMatchingRule(t, rules, { lane: own, kind: base.kind });
	const rule = i >= 0 ? rules[i].rule : null;
	const lane: Lane = rule?.then.mute
		? 'muted'
		: rule?.then.lane === 'turn'
			? 'turn'
			: rule?.then.lane === 'updates'
				? 'updates'
				: own;
	// A few words for the row: the turn's reason, or what happened in a conversation.
	const reason =
		base.mine && base.kind === 'reply' && turn?.turn !== 'you'
			? t.reason === 'mention'
				? 'Mentioned'
				: 'Replied'
			: turn
				? turn.turnReason
				: base.mine
					? base.summary
					: base.event || base.summary;
	return {
		lane,
		section: lane === 'turn' ? (OTHERS_WAIT.includes(base.kind) ? 'others' : 'work') : null,
		needs: base.kind,
		summary: base.summary,
		reason,
		event: base.event,
		actionLabel: base.actionLabel,
		actionUrl: base.actionUrl,
		waitingOn: lane === 'waiting' && turn ? waitingOnOf(t, turn) : null,
		waitingSince:
			turn && turn.turn !== 'none'
				? turn.waitingSince
				: (t.enrichment?.lastComment?.createdAt ?? null),
		priority: turn?.priority ?? (base.kind === 'security' ? 0 : 1),
		...(rule?.then.push !== undefined ? { push: rule.then.push } : {}),
		...(rule?.then.snoozeHours ? { snoozeHours: rule.then.snoozeHours } : {}),
		...(rule ? { rule: rule.name || `Rule ${i + 1}` } : {})
	};
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

/**
 * Do these conditions match an item? `base` is what the conditions on Hush's opinion read: the
 * lane (in rules, the lane before rules; in searches, the lane now) and what you must do.
 */
export function ruleMatches(
	m: RuleMatch,
	t: ItemFacts,
	base: { lane: Lane; kind: ActionKind; state?: string }
): boolean {
	const e = t.enrichment;
	if (!matchGlobs(t.repo, m.repo)) return false;
	if (m.reason && !m.reason.includes(t.reason)) return false;
	if (m.type && !m.type.includes(t.subjectType)) return false;
	if (!matchGlobs(e?.author, m.author)) return false;
	if (!textMatches(m.text, [t.title, t.repo, e?.author])) return false;
	if (m.kind && !m.kind.includes(base.kind)) return false;
	if (m.lane && !m.lane.includes(base.lane)) return false;
	if (m.itemState && !m.itemState.includes((base.state ?? 'active') as never)) return false;
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

/** A rule with its query compiled. */
export interface CompiledRule {
	rule: Rule;
	when: RuleMatch;
}

const compiled = new Map<string, RuleMatch>();
/** A query's conditions (cached: rules run for every item). Parts with errors are left out. */
export function compileQuery(query: string): RuleMatch {
	let m = compiled.get(query);
	if (!m) {
		m = parseQuery(query).when;
		if (compiled.size > 500) compiled.clear();
		compiled.set(query, m);
	}
	return m;
}

export const compileRules = (rules: Rule[]): CompiledRule[] =>
	rules.map((rule) => ({ rule, when: compileQuery(rule.when ?? '') }));

/** Index of the first enabled rule that matches (the one that wins), or -1. */
export function firstMatchingRule(
	t: ItemFacts,
	rules: CompiledRule[],
	base: { lane: Lane; kind: ActionKind }
): number {
	return rules.findIndex((r) => r.rule.enabled !== false && ruleMatches(r.when, t, base));
}

/** Push for an item that just came into Your turn? */
export function shouldPush(p: Placement, settings: Pick<Settings, 'push'>): boolean {
	if (p.push !== undefined) return p.push;
	return p.lane === 'turn' && settings.push;
}

/** A rule may snooze for 1 hour to 30 days. */
const MAX_SNOOZE_HOURS = 30 * 24;
const THEN_KEYS = new Set(['lane', 'push', 'mute', 'snoozeHours']);

/** Validate user-supplied rules. Returns an error message, or null when valid. */
export function validateRules(rules: unknown): string | null {
	if (!Array.isArray(rules)) return 'Rules must be a JSON array.';
	if (rules.length > 100) return 'Up to 100 rules are allowed.';
	for (const [i, r] of rules.entries()) {
		const at = `Rule ${i + 1}`;
		if (typeof r !== 'object' || r === null) return `${at}: must be an object.`;
		const { when, then, name, enabled } = r as Rule;
		if (name !== undefined && (typeof name !== 'string' || name.length > 60))
			return `${at}: "name" must be text of 60 characters or fewer.`;
		if (enabled !== undefined && typeof enabled !== 'boolean')
			return `${at}: "enabled" must be true or false.`;
		if (typeof when !== 'string') return `${at}: "when" must be a query, such as "repo:acme/*".`;
		if (when.length > 300) return `${at}: "when" must be 300 characters or fewer.`;
		const parsed = parseQuery(when);
		if (parsed.errors.length) return `${at}: ${parsed.errors[0]}`;
		if (parsed.when.itemState)
			return `${at}: is:done, is:snoozed, and is:muted work only in searches.`;
		if (typeof then !== 'object' || then === null) return `${at}: "then" must be an object.`;
		for (const k of Object.keys(then))
			if (!THEN_KEYS.has(k))
				return `${at}: unknown "then.${k}". Use lane, push, mute, or snoozeHours.`;
		if (then.lane !== undefined && then.lane !== 'turn' && then.lane !== 'updates')
			return `${at}: "then.lane" must be "turn" or "updates".`;
		if (then.push !== undefined && typeof then.push !== 'boolean')
			return `${at}: "then.push" must be true or false.`;
		if (then.mute !== undefined && typeof then.mute !== 'boolean')
			return `${at}: "then.mute" must be true or false.`;
		if (
			then.snoozeHours !== undefined &&
			!(
				Number.isInteger(then.snoozeHours) &&
				then.snoozeHours >= 1 &&
				then.snoozeHours <= MAX_SNOOZE_HOURS
			)
		)
			return `${at}: "then.snoozeHours" must be a whole number of hours from 1 to ${MAX_SNOOZE_HOURS}.`;
		if (
			then.lane === undefined &&
			then.push === undefined &&
			then.mute === undefined &&
			then.snoozeHours === undefined
		)
			return `${at}: "then" needs lane, push, mute, or snoozeHours.`;
	}
	return null;
}
