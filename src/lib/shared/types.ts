import type { Activity } from './activity';
import type { SubjectFacts } from './subject';
// Types shared by the Worker (worker/) and the SPA (src/).

/**
 * Where an item shows. "turn": you are the next person who must act. "waiting": you did your
 * part and someone else must act. "updates": everything else GitHub told you. "muted": a rule
 * hides it.
 */
export type Lane = 'turn' | 'waiting' | 'updates' | 'muted';
/** In Your turn: someone else waits on you, or your own work needs you. */
export type Section = 'others' | 'work';
/** What you did with an item: nothing yet, Done (until its turn changes), snoozed, or muted. */
export type ItemState = 'active' | 'done' | 'snoozed' | 'muted';

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

/** Everything the placement needs to know about one item. */
export interface ItemFacts {
	repo: string;
	subjectType: string;
	title: string;
	/** The newest notification's reason, or '' for an item that only a search found. */
	reason: Reason;
	htmlUrl: string;
	enrichment: Enrichment | null;
	/** The full facts of a PR or issue, when Hush has them (for "waiting since" and "on whom"). */
	subject?: SubjectFacts | null;
	me: string;
	/** "org/team" slugs of your teams whose review requests count (the teamReviewsAreMine setting). */
	myTeams?: string[];
	/** Already known (from the DTO); otherwise read from `enrichment`. */
	activity?: Activity | null;
}

/** Where an item goes, and what the row says about it (shared/place.ts). */
export interface Placement {
	lane: Lane;
	section: Section | null;
	needs: ActionKind;
	/** One line that says what happened, e.g. "CI failed on your PR". */
	summary: string;
	/** A few words: why it is in its lane ("Review requested", "Waiting for review"). */
	reason: string;
	/** Why GitHub notified you ("Review requested", "You opened this"), or ''. */
	event: string;
	actionLabel: string;
	actionUrl: string;
	/** Waiting: on whom ("@dave", "acme/web-core", "CI"). */
	waitingOn: string | null;
	/** When the current turn started, best estimate. */
	waitingSince: string | null;
	/** Lower sorts first inside a section. */
	priority: number;
	/** Set by a rule: push or not, in place of the push setting. */
	push?: boolean;
	/** Set by a rule: snooze a new arrival in Your turn for this many hours. */
	snoozeHours?: number;
	/** Name of the rule that matched, if any. */
	rule?: string;
}

/**
 * The conditions of a rule or a saved search, compiled from the query language (shared/query.ts).
 * People and files write them as a query string; this is the parsed form.
 */
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
	/** In rules: the lane before your rules. In searches: the lane now. */
	lane?: Lane[];
	bot?: boolean;
	label?: string[];
	draft?: boolean;
	/** PRs and issues only: open, closed, or merged. */
	state?: ('open' | 'closed' | 'merged')[];
	/** Glob(s) on who did the latest activity (a comment or a review; see shared/activity.ts). */
	by?: string | string[];
	/** The latest activity is by a bot (true) or by a person (false). */
	byBot?: boolean;
	/** Your state: done, snoozed, muted (searches only). */
	itemState?: ItemState[];
}

export interface Rule {
	name?: string;
	enabled?: boolean;
	/** A query, such as "repo:acme/website" or "author:dependabot*" (shared/query.ts). */
	when: string;
	then: {
		/** Put it in Your turn, or in Updates. */
		lane?: 'turn' | 'updates';
		/** Push or not, in place of the push setting. */
		push?: boolean;
		/** Hide it: it shows in no lane (it stays in Search, with is:muted). */
		mute?: boolean;
		/** When it arrives in Your turn, snooze it for this many hours (1 to 720). */
		snoozeHours?: number;
	};
}

/** A saved search: a named query, pinned as a tab after the lanes. */
export interface SavedSearch {
	id: string;
	name: string;
	query: string;
}

/** A GitHub search Hush runs to find items with no notification. `@team` runs once per team. */
export interface TrackedSearch {
	id: string;
	name: string;
	query: string;
	enabled: boolean;
}

/** Minutes after midnight, in `timeZone`. `from` after `to` crosses midnight. */
export interface QuietHours {
	from: number;
	to: number;
	/** Also quiet all day on Saturday and Sunday. */
	weekends: boolean;
	timeZone: string;
}

export interface Settings {
	// What counts as your turn.
	/** A review request to one of your teams is your turn (off: it waits on the team). */
	teamReviewsAreMine: boolean;
	/**
	 * When a review request stops being your turn. "strict": when GitHub no longer asks you.
	 * "any_review": also when someone else approves or asks for changes after the last push.
	 */
	reviewResolution: 'strict' | 'any_review';
	/** Bots' PRs and comments are updates (a review request to you by name still counts). */
	botsAreUpdates: boolean;
	/** An item whose turn is older than this many days is stale. */
	staleDays: number;
	/** Checked top to bottom after Hush's own placement; the first match wins. */
	rules: Rule[];
	// Push.
	/** Push when something becomes your turn. */
	push: boolean;
	/** Replace a recent alert with a quiet "✓ You approved" one when its item is resolved. */
	pushResolved: boolean;
	/** No pushes during these hours (they still go in the alert history). Null: off. */
	quietHours: QuietHours | null;
	/** When you see or finish an item in Hush, mark its notification read or done on GitHub too. */
	markReadOnGitHub: boolean;
	// Where Hush looks.
	/** GitHub searches that find items with no notification. */
	searches: TrackedSearch[];
	/** Added to every tracked search, e.g. "org:acme archived:false". */
	searchScope: string;
	/** "org/team" slugs that `@team` skips. */
	excludedTeams: string[];
	// Your lists and keys.
	/** Saved searches: tabs after the lanes, in order. */
	saved: SavedSearch[];
	/** Keyboard shortcuts you changed: command id → its keys ([] turns it off). See shared/keymap.ts. */
	keys: Record<string, string[]>;
	/** The right-click and "⋯" menu of an item: item ids in order (see shared/menus.ts). */
	menu: string[];
}

export type Turn = 'you' | 'team' | 'them' | 'none';

export interface TeamDTO {
	slug: string; // "org/team"
	name: string;
	org: string;
}

/** What changed on an item since you last saw it (shared/changes.ts). */
export interface Change {
	kind: 'commits' | 'ci' | 'review' | 'comments' | 'state' | 'draft' | 'requested' | 'labels';
	text: string;
	tone: 'good' | 'bad' | null;
}

/** One item as the API returns it to the app. */
export interface ItemDTO {
	/** "owner/repo#123" for a PR or issue, "t:<thread id>" for anything else. */
	key: string;
	repo: string;
	number: number | null;
	subjectType: string;
	title: string;
	/** The item on GitHub. */
	url: string;
	lane: Lane;
	section: Section | null;
	needs: ActionKind;
	summary: string;
	reason: string;
	/** Why GitHub notified you, or ''. */
	event: string;
	/** The notification reason (review_requested…), for queries. */
	eventKey: Reason | null;
	actionLabel: string;
	actionUrl: string;
	waitingOn: string | null;
	waitingSince: string | null;
	stale: boolean;
	state: ItemState;
	snoozedUntil: number | null;
	snoozeEvent: string | null;
	rule: string | null;
	/** Hush took it out of Your turn by itself: when, and why ("You approved"). */
	finished: { at: number; note: string } | null;
	/** You said it is (or is not) your turn, until it changes. */
	override: 'turn' | 'updates' | null;
	author: string | null;
	authorAvatar: string | null;
	authorIsBot: boolean;
	labels: string[];
	draft: boolean;
	ci: CiState | null;
	prState: 'open' | 'closed' | 'merged' | null;
	additions: number;
	deletions: number;
	/** The newest comment, review, or push (who, and whether a bot): shared/activity.ts. */
	activity: Activity | null;
	/** The newest activity on it, for ordering. */
	activityAt: string;
	/** You have not seen its newest activity. */
	unseen: boolean;
	seenAt: number | null;
	/** What changed since you last saw it; null when you never saw it. */
	changes: Change[] | null;
}

/** The lanes' counts: Your turn and Waiting (Updates has no count). */
export interface Counts {
	turn: number;
	waiting: number;
	updates: number;
}

/** A feed: one lane or saved search as Atom. `view` is 'turn', 'waiting', 'updates', or 's:<id>'. */
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
	/** The first-run questions were answered (or skipped). */
	onboarded: boolean;
	/** The first sync after sign-in has not finished: the lanes are still filling. */
	firstSync: boolean;
}

/**
 * The orgs your GitHub sign-in can see. GitHub leaves out, with no error or count, every org that
 * has not approved Hush; so Hush cannot tell which orgs are missing, only show what it sees.
 */
export type OrgAccess =
	{ available: false } | { available: true; orgs: string[]; approveUrl: string };

// --- Peek: one PR or issue in the side panel, with actions on it ---------------------

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
	/** The item, while Hush still has it. PRs and issues have a number and can be peeked. */
	item: {
		key: string;
		repo: string;
		number: number | null;
		title: string;
		url: string;
		/** What happened to it since: "Done", "Muted", "Snoozed", or the note ("You approved"). */
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
	};
}

/**
 * A message from the user's Durable Object on the live socket (/api/live): something changed, so
 * the tab refetches only that (or, for `status`, uses the values in the message).
 */
export type LiveMessage =
	| { type: 'items' }
	| { type: 'alerts' }
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
