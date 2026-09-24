// Types shared by the Worker (worker/) and the SPA (src/).

export type Category = 'action' | 'fyi' | 'muted';
export type Triage = 'inbox' | 'done' | 'snoozed';
export type View = 'action' | 'fyi' | 'snoozed' | 'done' | 'muted' | 'all';

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
	/** Treat activity by bots (dependabot, renovate…) as FYI. */
	botsAreFyi: boolean;
	/** A review request to one of your teams is "Needs you", not FYI. */
	teamReviewsAreAction: boolean;
	/** Evaluated top to bottom after the defaults; the first match wins. */
	rules: Rule[];
	dash: DashSettings;
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
	number: number | null;
	state: Enrichment['state'] | null;
	draft: boolean;
	ci: CiState | null;
	author: string | null;
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
	lastPollError: string | null;
	/** Orgs whose notifications GitHub hides from this token (SAML SSO not authorized). */
	ssoHiddenOrgs: number;
	scopes: string[];
}
