import type { Activity } from './activity';
import type { SnoozeChoice } from './item-snooze';
// Types shared by the Worker (worker/) and the SPA (src/).

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
	jevChoices?: Record<string, string>;
	createdAt?: string;
	updatedAt?: string;
	comments?: number;
	reviewed?: boolean;
}

export interface RuleFacts {
	repo: string;
	subjectType: string;
	title: string;
	enrichment: Enrichment | null;
	me: string;
	activity?: Activity | null;
	categories?: string[];
	now?: number;
}

export type ReviewWord = 'none' | 'required' | 'approved' | 'changes_requested';
export type CiWord = 'success' | 'failure' | 'pending';
export type NoWord = 'label' | 'assignee';

export interface RuleMatch {
	/** Glob(s) on "owner/repo", e.g. "acme/*". */
	repo?: string | string[];
	/** GitHub subject types: PullRequest, Issue, Release, Discussion, CheckSuite, Commit… */
	type?: string[];
	/** Glob(s) on the subject author's login. */
	author?: string | string[];
	/** Words that must all be in the title, repo, or author (not case-sensitive). */
	text?: string;
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
	assignee?: string | string[];
	reviewRequested?: string[];
	size?: string[];
	org?: string | string[];
	review?: ReviewWord[];
	ci?: CiWord[];
	comments?: string[];
	created?: string[];
	updated?: string[];
	no?: NoWord[];
	category?: string[];
}

export type MarkColor =
	'gray' | 'red' | 'orange' | 'amber' | 'green' | 'teal' | 'blue' | 'violet' | 'pink';

export interface ItemCategory {
	id: string;
	name: string;
	color: MarkColor;
	rule: string;
	description: string;
	icon?: string;
}

export interface CategoryGroup {
	id: string;
	name: string;
	categories: ItemCategory[];
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
	pushFacts: import('./push-facts').PushFact[];
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
	dash: DashSettings;
	categoryGroups: CategoryGroup[];
	views: ItemView[];
	/** Keyboard shortcuts you changed: command id → its keys ([] turns it off). See shared/keymap.ts. */
	keys: Record<string, string[]>;
	/** Right-click and "⋯" menus: item ids in order (see shared/menus.ts). */
	menus: { dash: string[]; v?: number };
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
	filter?: string;
}

export type GroupBy =
	| 'none'
	| 'role'
	| 'status'
	| 'repo'
	| 'author'
	| 'label'
	| 'assignee'
	| 'custom'
	| `category:${string}`
	| `project:${string}`;

export interface ViewSection {
	name: string;
	rule: string;
}

export interface ItemView {
	id: string;
	name: string;
	searches: string[];
	groupBy: GroupBy;
	pushNew?: boolean;
	sections?: ViewSection[];
}

export interface DashSettings {
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
	reviewRequestCount: number;
	reviewed: boolean;
	myLastReviewAt: string | null;
	/** Review threads nobody resolved yet (up to 50). */
	openThreads: number;
	stackBelowNearestFirst?: StackLink[];
	myLastReviewState: string | null;
	lastCommitAt: string | null;
	commentsNeedMe?: boolean | null;
	urgent?: boolean;
	categories?: string[];
	pinnedCategories?: string[];
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
	/** What changed since you last looked (none before your first look). */
	changes?: Change[];
	/** When you last looked at it, or null. */
	seenAt?: number | null;
	unread?: boolean;
	snooze?: SnoozeChoice;
	projectStatus?: Record<string, string | null>;
}

export interface DashProjectStatus {
	id: string;
	name: string;
	color: string;
}

export interface DashProject {
	key: string;
	title: string;
	url: string;
	statuses: DashProjectStatus[];
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
	projects?: DashProject[];
}

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
	nextPollAt: number | null;
	lastPollError: string | null;
	scopes: string[];
	/** 'app': the token from Sign in with GitHub. 'own': a token you added in Settings. */
	tokenSource: 'app' | 'own';
	smartDecisionsPaused: boolean;
	smartDecisionsChecking: boolean;
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
	item: { repo: string; number: number; kind: DashKind } | null;
}

export interface PeekDTO {
	/** The peek also updated the stored facts: `changed` means the lists are out of date. */
	sync?: { changed: boolean };
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
	  };
