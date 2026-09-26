// Types shared by the Worker (worker/) and the SPA (src/).

export type Category = 'action' | 'fyi' | 'muted';
export type Triage = 'inbox' | 'done' | 'snoozed';
export type View = 'action' | 'fyi' | 'snoozed' | 'done' | 'muted' | 'all' | 'inbox';

/** What a saved view starts from. "inbox" is Needs you and FYI together. */
export type ViewBase = 'inbox' | 'action' | 'fyi' | 'snoozed' | 'done';

/** A named filter on the inbox, shown as a tab (see shared/views.ts). */
export interface SavedView {
	id: string;
	name: string;
	base: ViewBase;
	/** Free text, the same as the Filter box. */
	query?: string;
	/** The same conditions as rules. All must match. */
	when: RuleMatch;
}

export type ActionKind =
	| 'review'
	| 'fix_ci'
	| 'address_review'
	| 'resolve_conflict'
	| 'merge'
	| 'reply'
	| 'triage'
	| 'security'
	| 'none';

/** GitHub notification `reason` values. */
export type Reason =
	| 'approval_requested'
	| 'assign'
	| 'author'
	| 'comment'
	| 'ci_activity'
	| 'invitation'
	| 'manual'
	| 'member_feature_requested'
	| 'mention'
	| 'review_requested'
	| 'security_alert'
	| 'security_advisory_credit'
	| 'state_change'
	| 'subscribed'
	| 'team_mention'
	| (string & {});

export type CiState = 'SUCCESS' | 'FAILURE' | 'ERROR' | 'PENDING' | 'EXPECTED';

export interface LastComment {
	author: string;
	authorIsBot: boolean;
	body: string;
	url: string;
	createdAt: string;
}

/** Extra facts about a thread's subject, fetched from GraphQL. */
export interface Enrichment {
	kind: 'pr' | 'issue' | 'other';
	number?: number;
	url?: string;
	state?: 'open' | 'closed' | 'merged';
	draft?: boolean;
	author?: string;
	authorIsBot?: boolean;
	reviewDecision?: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
	mergeable?: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
	ci?: CiState | null;
	reviewRequestedFromMe?: boolean;
	requestedTeams?: string[];
	assignedToMe?: boolean;
	labels?: string[];
	additions?: number;
	deletions?: number;
	lastComment?: LastComment | null;
	/** PRs: when the newest commit was made. */
	lastCommitAt?: string | null;
	/** PRs: the newest review. */
	latestReview?: { author: string; at: string; state: string } | null;
	/** PRs: your own newest review. */
	myReview?: { at: string; state: string } | null;
	/** PRs: review threads nobody resolved yet (up to 50). */
	openThreads?: number;
	/** PRs: the newest approval or change request by someone who is not you or the author. */
	lastVerdict?: { by: string; at: string } | null;
}

/** Everything the classifier needs to know about one notification thread. */
export interface ThreadFacts {
	repo: string;
	subjectType: string;
	title: string;
	reason: Reason;
	htmlUrl: string;
	enrichment: Enrichment | null;
	me: string;
	/** "org/team" slugs of the teams you are in. */
	myTeams?: string[];
}

export interface Classification {
	category: Category;
	kind: ActionKind;
	/** One line that says what happened, e.g. "CI failed on your PR". */
	summary: string;
	/** Short "why you see this" tag. */
	why: string;
	actionLabel: string;
	actionUrl: string;
	/** Set by a rule; overrides the default push decision. */
	push?: boolean;
	/** Name of the rule that matched, if any. */
	rule?: string;
}

export interface RuleMatch {
	/** Glob(s) on "owner/repo", e.g. "PostHog/*". */
	repo?: string | string[];
	reason?: Reason[];
	/** GitHub subject types: PullRequest, Issue, Release, Discussion, CheckSuite, Commit… */
	type?: string[];
	/** Glob(s) on the subject author's login. */
	author?: string | string[];
	/** Case-insensitive substring of the title. */
	titleContains?: string;
	kind?: ActionKind[];
	category?: Category[];
	bot?: boolean;
	label?: string[];
	draft?: boolean;
}

export interface Rule {
	name?: string;
	enabled?: boolean;
	when: RuleMatch;
	then: { category?: Category; push?: boolean };
}

export interface Settings {
	/** Send Web Push for Action items. */
	pushAction: boolean;
	/** Send Web Push for FYI items too. */
	pushFyi: boolean;
	/** Push when a thread becomes your turn with no new notification (the inbox watcher). */
	pushTurnChanges: boolean;
	/** Replace an alert already shown with a quiet "✓ resolved" one when its thread is resolved. */
	pushResolved: boolean;
	/** A thread open in the peek for a moment is marked as read. */
	peekMarksRead: boolean;
	/**
	 * When a review request stops being your turn. "strict": when GitHub no longer asks you.
	 * "any_review": also when someone else approves or asks for changes after the last push.
	 */
	reviewResolution: 'strict' | 'any_review';
	/** Treat activity by bots (dependabot, renovate…) as FYI. */
	botsAreFyi: boolean;
	/** A review request to one of your teams is "Needs you", not FYI. */
	teamReviewsAreAction: boolean;
	/** Evaluated top to bottom after the defaults; the first match wins. */
	rules: Rule[];
	dash: DashSettings;
	/** Saved views: extra inbox tabs, in order. */
	views: SavedView[];
	/** Right-click and "⋯" menus: item ids in order (see shared/menus.ts). */
	menus: { inbox: string[]; dash: string[]; v?: number };
}

// --- Pull request and issue dashboards ------------------------------------------

export type DashKind = 'pr' | 'issue';
export type Turn = 'you' | 'team' | 'them' | 'none';

/** A saved GitHub search. `@me` is you; `@team` runs the query once per tracked team. */
export interface DashSection {
	id: string;
	name: string;
	query: string;
	enabled: boolean;
}

export interface DashSettings {
	pr: DashSection[];
	issue: DashSection[];
	/** Appended to every query, e.g. "org:PostHog archived:false". */
	scope: string;
	/** "org/team" slugs that `@team` must skip. */
	excludedTeams: string[];
	/** An item that waits longer than this is marked stale. */
	staleDays: number;
	/** Hide draft PRs that you did not open. */
	hideOthersDrafts: boolean;
	/** Hide PRs and issues that bots opened (dependabot, renovate…). */
	hideBots: boolean;
}

export interface TeamDTO {
	slug: string; // "org/team"
	name: string;
	org: string;
}

export interface DashLabel {
	name: string;
	color: string;
}

export interface DashItem {
	id: string;
	kind: DashKind;
	number: number;
	title: string;
	url: string;
	repo: string;
	author: string;
	authorAvatar: string | null;
	authorIsBot: boolean;
	createdAt: string;
	updatedAt: string;
	state: 'open' | 'closed' | 'merged';
	draft: boolean;
	labels: DashLabel[];
	comments: number;
	lastCommentBy: string | null;
	lastCommentAt: string | null;
	lastCommentIsBot: boolean;
	assignees: string[];
	// Pull requests only.
	ci: CiState | null;
	reviewDecision: Enrichment['reviewDecision'];
	mergeable: Enrichment['mergeable'] | null;
	additions: number;
	deletions: number;
	requestedMe: boolean;
	/** Your teams whose review is requested. */
	requestedTeams: string[];
	requestedAt: string | null;
	myLastReviewAt: string | null;
	/** Review threads nobody resolved yet (up to 50). */
	openThreads: number;
	/** Newest approval or change request by someone else (not you, not the author). */
	lastVerdictBy: string | null;
	lastVerdictAt: string | null;
	myLastReviewState: string | null;
	lastCommitAt: string | null;
	// Computed.
	sections: string[];
	turn: Turn;
	turnReason: string;
	/** When the current turn started, best estimate. */
	waitingSince: string;
	stale: boolean;
	actionLabel: string;
	actionUrl: string;
	/** Lower sorts first inside a turn group. */
	priority: number;
	dismissed: boolean;
	/** The turn Hush computed, before any move by you. */
	autoTurn: Turn;
	/** You dragged this into its group; lasts until the item changes. */
	movedByYou: boolean;
	/** Your manual position inside the group, or null (new items go on top). */
	rank: number | null;
}

export interface DashResponse {
	kind: DashKind;
	items: DashItem[];
	sections: { id: string; name: string; count: number; skipped?: string }[];
	teams: TeamDTO[];
	fetchedAt: number;
	errors: string[];
}

/** A thread as the API returns it to the SPA. */
export interface ThreadDTO {
	id: string;
	repo: string;
	subjectType: string;
	title: string;
	reason: Reason;
	unread: boolean;
	updatedAt: string;
	htmlUrl: string;
	category: Category;
	kind: ActionKind;
	summary: string;
	why: string;
	actionLabel: string;
	actionUrl: string;
	triage: Triage;
	snoozedUntil: number | null;
	/** Snoozed until something happens (e.g. "ci_pass"); `snoozedUntil` is then the deadline. */
	snoozeEvent: string | null;
	/** Set when Hush moved the thread to Done by itself, e.g. "You approved". */
	resolvedNote: string | null;
	number: number | null;
	state: Enrichment['state'] | null;
	draft: boolean;
	ci: CiState | null;
	author: string | null;
	authorIsBot: boolean;
	labels: string[];
	rule: string | null;
}

export interface Counts {
	action: number;
	fyi: number;
	snoozed: number;
}

export interface FeedFilter {
	view: 'action' | 'fyi' | 'all';
	repo?: string;
}

export interface FeedDTO {
	id: string;
	name: string;
	filter: FeedFilter;
	url: string;
	createdAt: number;
}

export interface MeDTO {
	login: string;
	name: string | null;
	avatarUrl: string | null;
	settings: Settings;
	lastPollAt: number | null;
	/** When the server polls GitHub next; the browser refreshes the inbox just after it. */
	nextPollAt: number | null;
	lastPollError: string | null;
	/** Orgs whose notifications GitHub hides from this token (SAML SSO not authorized). */
	ssoHiddenOrgs: number;
	scopes: string[];
}

// --- Peek: a read-only view of one PR or issue --------------------------------------

export type CheckState = 'failure' | 'pending' | 'success' | 'neutral';

export interface PeekPerson {
	login: string;
	avatar: string | null;
	bot: boolean;
}

export interface PeekEntry {
	type: 'comment' | 'review';
	author: PeekPerson;
	at: string;
	url: string;
	/** GitHub's rendered HTML. The client must sanitize it before it shows it. */
	html: string;
	/** Reviews only. */
	state?: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
	/** Reviews only: inline comments on the diff (not shown in the peek). */
	inline?: number;
}

/** One alert from the history (the bell). */
export interface AlertDTO {
	id: number;
	sentAt: number;
	title: string;
	body: string;
	/** Where the alert went (the main action). */
	url: string;
	/** The thread, while Hush still has it. PRs and issues have a number and can be peeked. */
	thread: {
		repo: string;
		number: number | null;
		title: string;
		htmlUrl: string;
		/** What happened to it since: "Done", "Muted", "Snoozed", or the resolved note. */
		state: string | null;
	} | null;
}

export interface PeekDTO {
	/** The peek also updated the stored facts: `changed` means the lists are out of date. */
	sync?: { changed: boolean; resolved: { title: string; note: string }[] };
	kind: 'pr' | 'issue';
	number: number;
	title: string;
	url: string;
	repo: string;
	state: 'open' | 'closed' | 'merged';
	draft: boolean;
	author: PeekPerson;
	createdAt: string;
	html: string;
	labels: { name: string; color: string }[];
	assignees: string[];
	pr?: {
		base: string;
		head: string;
		additions: number;
		deletions: number;
		files: number;
		/** Review threads nobody resolved (up to 50). */
		openThreads: number;
		reviewDecision: string | null;
		mergeable: string | null;
		/** The latest review from each person who approved or asked for changes. */
		reviews: { who: PeekPerson; state: string }[];
		requested: { name: string; team: boolean }[];
		ci: CiState | null;
		checks: { name: string; state: CheckState; url: string | null }[];
		checksTotal: number;
	};
	timeline: { total: number; items: PeekEntry[] };
}

/**
 * A message from the user's Durable Object on the live socket (/api/live): something changed, so
 * the tab refetches only that (or, for `status`, uses the values in the message).
 */
export type LiveMessage =
	| { type: 'threads' }
	| { type: 'alerts' }
	| { type: 'dash'; kind: DashKind }
	| { type: 'settings' }
	| {
			type: 'status';
			lastPollAt: number | null;
			nextPollAt: number | null;
			lastPollError: string | null;
			ssoHiddenOrgs: number;
	  };
