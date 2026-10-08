import type { Activity } from './activity';
// Types shared by the Worker (worker/) and the SPA (src/).

export type Category = 'action' | 'fyi' | 'muted';
export type Triage = 'inbox' | 'done' | 'snoozed';
export type View = 'action' | 'fyi' | 'snoozed' | 'done' | 'muted' | 'all' | 'inbox';

/** What a notification view starts from. "inbox" is Needs you and FYI together. */
export type ViewBase = 'inbox' | 'action' | 'fyi' | 'snoozed' | 'done';

/** A named filter on the inbox, shown as a tab (see shared/views.ts). */
export interface SavedView {
	id: string;
	name: string;
	base: ViewBase;
	/** A query: the same words as rules and the Filter box. "" shows every thread of the base. */
	query: string;
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
	previousComment?: LastComment | null;
	assignees?: string[];
	reviewRequests?: string[];
	commentsNeedMe?: boolean | null;
	urgent?: boolean;
	smart?: string[];
	jevCategory?: string | null;
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
	/** Already known (views, from the thread DTO); otherwise read from `enrichment`. */
	activity?: Activity | null;
	sources?: string[];
	itemCategoryId?: string | null;
	itemCategory?: { id: string; name: string };
	itemTags?: { id: string; name: string }[];
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
	/** Set by a rule: move the thread to Done, or snooze it for `snoozeHours`. */
	triage?: 'done' | 'snooze';
	snoozeHours?: number;
	/** Name of the rule that matched, if any. */
	rule?: string;
}

export interface RuleMatch {
	/** Glob(s) on "owner/repo", e.g. "acme/*". */
	repo?: string | string[];
	reason?: Reason[];
	/** GitHub subject types: PullRequest, Issue, Release, Discussion, CheckSuite, Commit… */
	type?: string[];
	/** Glob(s) on the subject author's login. */
	author?: string | string[];
	/** Words that must all be in the title, repo, or author (not case-sensitive). */
	text?: string;
	kind?: ActionKind[];
	category?: Category[];
	bot?: boolean;
	label?: string[];
	draft?: boolean;
	/** PRs and issues only: open, closed, or merged. */
	state?: ('open' | 'closed' | 'merged')[];
	/** Glob(s) on who did the latest activity (a comment or a review; see shared/activity.ts). */
	by?: string | string[];
	/** The latest activity is by a bot (true) or by a person (false). */
	byBot?: boolean;
	about?: string[];
	source?: string[];
	itemCategory?: string[];
	itemTag?: string[];
	assignee?: string | string[];
	reviewRequested?: string[];
	size?: string[];
}

export type MarkColor =
	'gray' | 'red' | 'orange' | 'amber' | 'green' | 'teal' | 'blue' | 'violet' | 'pink';

export type CategoryInbox = 'auto' | Category;
export type CategoryPush = 'inherit' | 'on' | 'off';
export type CategoryTriage = 'done' | 'snooze';

export interface ItemCategory {
	id: string;
	name: string;
	color: MarkColor;
	rule: string;
	description: string;
	icon?: string;
	inbox?: CategoryInbox;
	push?: CategoryPush;
	triage?: CategoryTriage;
	snoozeHours?: number;
}

export interface ItemTag {
	id: string;
	name: string;
	color: MarkColor;
	rule: string;
}

export interface LegacyInboxRule {
	name?: string;
	enabled?: boolean;
	/** A query (shared/query.ts), such as "repo:acme/* needs:review". "" matches every thread. */
	when: string;
	then: {
		category?: Category;
		push?: boolean;
		/** Also move the thread: to Done, or snoozed for `snoozeHours` (see categoryTriage). */
		triage?: 'done' | 'snooze';
		snoozeHours?: number;
	};
}

/** Minutes after midnight, in `timeZone`. `from` after `to` crosses midnight. */
export interface QuietHours {
	from: number;
	to: number;
	/** Also quiet all day on Saturday and Sunday. */
	weekends: boolean;
	timeZone: string;
}

export interface AlertChannels {
	push: boolean;
	slack: boolean;
}

export interface Settings {
	/** Send Web Push for Action items. */
	pushAction: boolean;
	/** Send Web Push for FYI items too. */
	pushFyi: boolean;
	/** Push when a thread becomes your turn with no new notification (the inbox watcher). */
	pushTurnChanges: boolean;
	/** No pushes during these hours (they still go in the alert history). Null: off. */
	quietHours: QuietHours | null;
	pushRepeat: import('./push-policy').PushRepeat;
	pushDigestMinutes: number | null;
	pushLimit: import('./push-policy').PushLimit | null;
	pushWhileOpen: boolean;
	pushUrgentNow: boolean;
	alertChannels: AlertChannels;
	smartDecisions: boolean;
	clearNotifications: import('./push-policy').ClearNotifications;
	/** A thread open in the peek for a moment is marked as read. */
	peekMarksRead: boolean;
	/**
	 * When a review request stops being your turn. "strict": when GitHub no longer asks you.
	 * "any_review": also when someone else approves or asks for changes after the last push.
	 */
	reviewResolution: 'strict' | 'any_review';
	/**
	 * When new commits after your review make it your turn again. "always", "changes_requested":
	 * only when your last review asked for changes, or "never".
	 */
	newCommitsAfterReview: import('./dashboard').NewCommitsAfterReview;
	/** Treat activity by bots (dependabot, renovate…) as FYI. */
	botsAreFyi: boolean;
	/** A review request to one of your teams is "Needs you", not FYI. */
	teamReviewsAreAction: boolean;
	dash: DashSettings;
	sources: DashSection[];
	tracked: string[];
	categories: ItemCategory[];
	tags: ItemTag[];
	/** Notification views: extra inbox tabs, in order. */
	views: SavedView[];
	/** Keyboard shortcuts you changed: command id → its keys ([] turns it off). See shared/keymap.ts. */
	keys: Record<string, string[]>;
	/** Right-click and "⋯" menus: item ids in order (see shared/menus.ts). */
	menus: { inbox: string[]; dash: string[]; v?: number };
	/** Swipe actions on touch screens, for each list (see shared/swipe.ts). */
	swipe: import('./swipe').SwipeSettings;
	rows: import('./row-parts').RowSettings;
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
	/** Appended to every query, e.g. "org:acme archived:false". */
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

/** One thing that changed since you last looked at a PR or issue (shared/changes.ts). */
export interface Change {
	kind: 'commits' | 'ci' | 'review' | 'comments' | 'state' | 'draft' | 'requested' | 'labels';
	text: string;
	tone: 'good' | 'bad' | null;
	/** The labels added (kind "labels"), so a row that shows labels can mark them. */
	labels?: string[];
}

export interface StackLink {
	number: number;
	title: string;
	url: string;
	author: string;
	draft: boolean;
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
	authorAssociation?: string | null;
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
	stackBelowNearestFirst?: StackLink[];
	/** Newest approval or change request by someone else (not you, not the author). */
	lastVerdictBy: string | null;
	lastVerdictAt: string | null;
	myLastReviewState: string | null;
	lastCommitAt: string | null;
	commentsNeedMe?: boolean | null;
	urgent?: boolean;
	category?: string;
	categoryPinned?: boolean;
	tags?: string[];
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
	/** You muted it: hidden until you unmute it (not until it changes). */
	muted?: boolean;
	/** The turn Hush computed, before any move by you. */
	autoTurn: Turn;
	/** You dragged this into its group; lasts until the item changes. */
	movedByYou: boolean;
	/** Your manual position inside the group, or null (new items go on top). */
	rank: number | null;
	/** What changed since you last looked (none before your first look). */
	changes?: Change[];
	/** When you last looked at it, or null. */
	seenAt?: number | null;
}

export interface DashResponse {
	kind: DashKind;
	items: DashItem[];
	sections: { id: string; name: string; count: number; skipped?: string }[];
	teams: TeamDTO[];
	fetchedAt: number;
	errors: string[];
	/** This is the saved list; a new one is on its way (a live message says when). */
	refreshing?: boolean;
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
	itemCategory: string | null;
	tags: string[];
	/** You said it does not need you ("only this one"): FYI until it changes. */
	override?: boolean;
	/** What changed since you last looked at its PR or issue (none before your first look). */
	changes?: Change[];
	/** When you last looked at its PR or issue, or null. */
	seenAt?: number | null;
	/** The newest comment, review, or push (who, and whether a bot): shared/activity.ts. */
	activity: Activity | null;
	smart?: string[];
}

export interface Counts {
	action: number;
	fyi: number;
	snoozed: number;
}

/** A feed: one inbox tab as Atom. `view` is 'action', 'fyi', 'inbox', or 'v:<notification view id>'. */
export interface FeedDTO {
	view: string;
	/** Only when the feed was just made: Hush keeps only a hash of the address. */
	url?: string;
	createdAt: number;
}

/** One sign-in session (Settings → General → Account). `id` is the hash of its cookie. */
export interface SessionDTO {
	id: string;
	/** "Chrome on macOS", from the browser that signed in. */
	label: string | null;
	createdAt: number;
	lastSeenAt: number;
	/** This browser. */
	current: boolean;
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
	/** 'app': the token from Sign in with GitHub. 'own': a token you added in Settings. */
	tokenSource: 'app' | 'own';
	/** The first sync after sign-in has not finished: the inbox is still filling. */
	firstSync: boolean;
	smartDecisionsPaused: boolean;
	smartDecisionsChecking: boolean;
	/** The first-run questions were answered (or skipped). */
	onboarded: boolean;
}

/**
 * The orgs your GitHub sign-in can see. GitHub leaves out, with no error or count, every org that
 * has not approved Hush; so Hush cannot tell which orgs are missing, only show what it sees.
 */
export interface SlackStatusDTO {
	available: boolean;
	connection: { teamName: string; connectedAt: number } | null;
	mentions: { available: boolean; connected: boolean };
}

export interface SlackMentionDTO {
	channelName: string;
	authorName: string;
	at: number;
	extract: string;
	permalink: string;
}

export type OrgAccess =
	{ available: false } | { available: true; orgs: string[]; approveUrl: string };

// --- Peek: one PR or issue in the side panel, with actions on it ---------------------

export type CheckState = 'failure' | 'pending' | 'success' | 'neutral';

export interface PeekPerson {
	login: string;
	avatar: string | null;
	bot: boolean;
}

export type ReactionContent =
	'THUMBS_UP' | 'THUMBS_DOWN' | 'LAUGH' | 'HOORAY' | 'CONFUSED' | 'HEART' | 'ROCKET' | 'EYES';

/** The reactions on a comment, review, or description, as GitHub shows them under it. */
export interface Reactions {
	/** The GraphQL node ID of the comment (what you react to). */
	id: string;
	/** False in a locked conversation you cannot write in, for example. */
	canReact: boolean;
	/** Only the reactions someone gave, in GitHub's order. */
	groups: { content: ReactionContent; count: number; mine: boolean }[];
}

export interface PeekEntry {
	type: 'comment' | 'review';
	reactions?: Reactions;
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
	/** The thread, while Hush still has it (it can be peeked). PRs and issues have a number. */
	thread: {
		id: string;
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
	authorAssociation?: string | null;
	createdAt: string;
	html: string;
	/** The description's reactions. */
	reactions?: Reactions;
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
		lastReview: { oid: string; at: string } | null;
	};
	timeline: { total: number; items: PeekEntry[] };
	/** What you may do here: the action buttons read it (shared/actions.ts). */
	can: PeekCan;
}

export type MergeMethod = 'MERGE' | 'SQUASH' | 'REBASE';

/** Your permissions and the state the actions need, read with the peek. */
export interface PeekCan {
	/** The GraphQL node ID (for the auto-merge mutations). */
	id: string;
	/** You opened it (GitHub does not let you review your own PR). */
	author: boolean;
	close: boolean;
	reopen: boolean;
	update?: boolean;
	/** The conversation is not locked (or you may still write in it). */
	comment: boolean;
	/** Your permission on the repository: ADMIN, MAINTAIN, WRITE, TRIAGE, or READ. */
	permission: string | null;
	pr?: {
		/** The head commit you saw: a merge fails if the branch moved since. */
		headOid: string;
		/** GitHub's merge state: CLEAN, BLOCKED, BEHIND, DIRTY, UNSTABLE, HAS_HOOKS, DRAFT, UNKNOWN. */
		mergeState: string;
		methods: MergeMethod[];
		mergeAsAdmin: boolean;
		autoMerge: { on: boolean; method: MergeMethod | null; canEnable: boolean; canDisable: boolean };
		/** Workflow runs with a failed job, for "Re-run failed jobs". */
		failedRuns: number[];
		stack: PeekStack;
	};
}

export interface PeekStack {
	gitHubStacksEnabled: boolean;
	numberOnGitHub: number | null;
	openPrsBelowOnGitHub: number[];
	mergesIntoDefaultBranch: boolean;
	openPrsAboveNearestFirst: number[];
	branchesAbove: boolean;
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
	/** A poll started (on) or ended: open tabs show "Syncing…". */
	| { type: 'syncing'; on: boolean }
	| {
			type: 'status';
			lastPollAt: number | null;
			nextPollAt: number | null;
			lastPollError: string | null;
			ssoHiddenOrgs: number;
			firstSync: boolean;
	  };
