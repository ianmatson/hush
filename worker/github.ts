import type {
	CheckState,
	CiState,
	CloseReason,
	LastComment,
	PeekDTO,
	PeekEntry,
	PeekPerson,
	StackLink,
	TeamDTO
} from '../src/lib/shared/types';
import { newestFirst, SOURCE_RESULTS_MAX } from '../src/lib/shared/item-views';
import { isBot } from '../src/lib/shared/bots';
import { ciRunning, ciWord } from '../src/lib/shared/ci';
import { bodyExcerpt } from '../src/lib/shared/decisions';
import { requestedByName, sameLogin } from '../src/lib/shared/logins';
import { REACTION_FIELDS, reactionsOf } from '../src/lib/shared/reactions';
import type { ExpandedQuery } from '../src/lib/shared/dashboard';
import type { SubjectFacts, TeamMention } from '../src/lib/shared/subject';
import { NO_STACK } from '../src/lib/shared/stack-merge';
import { hasWritePermission } from '../src/lib/shared/actions';
import { HOUR_MS, SECOND_MS } from '../src/lib/shared/durations';
import { readStack } from './stacks';

const API = 'https://api.github.com';
const UA = 'hush-notifications (+https://github.com)';

export interface GraphqlError {
	message: string;
	type?: string;
	path?: (string | number)[];
}

export function hasGraphqlErrorAt(errors: GraphqlError[], path: (string | number)[]): boolean {
	return errors.some(
		(error) =>
			!error.path?.length ||
			path
				.slice(0, Math.min(path.length, error.path.length))
				.every((part, i) => part === error.path![i])
	);
}

export class GitHubError extends Error {
	constructor(
		public status: number,
		message: string,
		public resetAt?: number
	) {
		super(message);
	}
}

/**
 * The longest Hush waits for GitHub. GitHub stops a request itself after about 10 seconds; a
 * request with no answer at all (a broken connection) must not keep work open forever.
 */
const GITHUB_WAIT_MS = 20_000;
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

export async function gh(token: string, path: string, init: RequestInit = {}): Promise<Response> {
	const headers = new Headers(init.headers);
	headers.set('Authorization', `Bearer ${token}`);
	if (!headers.has('Accept')) headers.set('Accept', 'application/vnd.github+json');
	headers.set('X-GitHub-Api-Version', '2022-11-28');
	headers.set('User-Agent', UA);
	const url = path.startsWith('http') ? path : `${API}${path}`;
	if (init.signal) return fetch(url, { ...init, headers });
	const noAnswer = new AbortController();
	const waitForAnswer = setTimeout(
		() => noAnswer.abort(new DOMException('The operation timed out.', 'TimeoutError')),
		GITHUB_WAIT_MS
	);
	try {
		const res = await fetch(url, { ...init, headers, signal: noAnswer.signal });
		const body = NULL_BODY_STATUSES.has(res.status) ? null : await res.arrayBuffer();
		return new Response(body, {
			status: res.status,
			statusText: res.statusText,
			headers: res.headers
		});
	} finally {
		clearTimeout(waitForAnswer);
	}
}

export const githubStatusMessage = (status: number) => `GitHub returned ${status}.`;

export async function refusal(res: Response): Promise<string> {
	const answer = (await res.json().catch(() => ({}))) as {
		message?: string;
		errors?: ({ message?: string } | string)[];
	};
	const detail = answer.errors?.map((e) => (typeof e === 'string' ? e : e.message)).filter(Boolean);
	return (
		[answer.message, ...(detail ?? [])].filter(Boolean).join(': ') ||
		githubStatusMessage(res.status)
	);
}

export interface GraphqlResult<T> {
	ok: boolean;
	status: number;
	data?: T;
	errors: GraphqlError[];
}

export const NO_CALL_LEFT = 0;
const RATE_LIMITED = 'RATE_LIMITED';
const RATE_LIMITED_WAIT_MS = 60_000;

export class CallBudget {
	retryAt: number | null = null;

	constructor(private remaining: number) {}

	get open(): boolean {
		return this.retryAt === null && this.remaining > 0;
	}

	take(count = 1): boolean {
		if (!this.open || count > this.remaining) return false;
		this.remaining -= count;
		return true;
	}

	noteLimit(res: Response) {
		const at = rateLimitRetryAt(res.headers);
		const refused = res.status === 403 || res.status === 429;
		if (at !== undefined && (refused || res.headers.get('X-RateLimit-Remaining') === '0'))
			this.limitUntil(at);
	}

	limitUntil(at: number) {
		this.retryAt = Math.max(this.retryAt ?? 0, at);
	}
}

const GITHUB_GAVE_NO_ANSWER = 'GitHub did not answer.';

export async function graphql<T = Node>(
	token: string,
	query: string,
	variables: Record<string, unknown>,
	budget?: CallBudget
): Promise<GraphqlResult<T>> {
	if (budget && !budget.take()) return { ok: false, status: NO_CALL_LEFT, errors: [] };
	const res = await gh(token, '/graphql', {
		method: 'POST',
		body: JSON.stringify({ query, variables })
	});
	budget?.noteLimit(res);
	const answer = (await res.json().catch(() => null)) as {
		data?: T | null;
		errors?: GraphqlError[];
	} | null;
	if (!answer && res.ok) throw new GitHubError(502, GITHUB_GAVE_NO_ANSWER);
	if (budget && answer?.errors?.some((error) => error.type === RATE_LIMITED))
		budget.limitUntil(rateLimitRetryAt(res.headers) ?? Date.now() + RATE_LIMITED_WAIT_MS);
	return {
		ok: res.ok,
		status: res.status,
		data: answer?.data ?? undefined,
		errors: answer?.errors ?? []
	};
}

export function graphqlFailure(result: GraphqlResult<unknown>): string | null {
	if (result.ok && !result.errors.length) return null;
	return result.errors[0]?.message || githubStatusMessage(result.status);
}

export async function graphqlData<T>(
	token: string,
	query: string,
	variables: Record<string, unknown>
): Promise<T> {
	const result = await graphql<T>(token, query, variables);
	const failure = graphqlFailure(result);
	if (failure || !result.data)
		throw new GitHubError(
			result.ok ? 502 : result.status,
			failure ?? githubStatusMessage(result.status)
		);
	return result.data;
}

export interface WriteFailure {
	error: string;
	status: 422 | 502;
}

const REFUSED: WriteFailure['status'] = 422;
const FAILED: WriteFailure['status'] = 502;

export const failedWriteStatus = (githubStatus: number): WriteFailure['status'] =>
	githubStatus >= 500 ? FAILED : REFUSED;

const GITHUB_UNREACHABLE: WriteFailure = { error: GITHUB_GAVE_NO_ANSWER, status: FAILED };

export const refusedWrite = (error: string): WriteFailure => ({ error, status: REFUSED });

export async function restWriteFailure(res: Response | null): Promise<WriteFailure> {
	return res
		? { error: await refusal(res), status: failedWriteStatus(res.status) }
		: GITHUB_UNREACHABLE;
}

export function graphqlWriteFailure(result: GraphqlResult<unknown> | null): WriteFailure | null {
	if (!result) return GITHUB_UNREACHABLE;
	const error = graphqlFailure(result);
	return error ? { error, status: failedWriteStatus(result.status) } : null;
}

export interface GhUser {
	id: number;
	login: string;
	name: string | null;
	avatar_url: string;
}

export async function getViewer(token: string): Promise<{ user: GhUser; scopes: string[] }> {
	const res = await gh(token, '/user');
	if (!res.ok) throw new GitHubError(res.status, `GitHub rejected the token (${res.status}).`);
	const scopes = (res.headers.get('X-OAuth-Scopes') ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	return { user: (await res.json()) as GhUser, scopes };
}

export interface GhNotification {
	id: string;
	unread: boolean;
	reason: string;
	updated_at: string;
	last_read_at: string | null;
	subject: { title: string; url: string | null; latest_comment_url: string | null; type: string };
	repository: { full_name: string; html_url: string; name: string; owner: { login: string } };
}

export function subjectNumber(n: {
	subject: Pick<GhNotification['subject'], 'type' | 'url'>;
}): number | null {
	if (n.subject.type !== 'PullRequest' && n.subject.type !== 'Issue') return null;
	const m = n.subject.url?.match(/\/(?:pulls|issues)\/(\d+)$/);
	return m ? Number(m[1]) : null;
}

export interface NotificationsPage {
	status: number;
	items: GhNotification[];
	lastModified: string | null;
	pollInterval: number;
	retryAt?: number;
}

export function rateLimitRetryAt(headers: Headers, now = Date.now()): number | undefined {
	const retryAfter = headers.get('Retry-After')?.trim();
	if (retryAfter) {
		const seconds = Number(retryAfter);
		const at = Number.isFinite(seconds) ? now + seconds * SECOND_MS : Date.parse(retryAfter);
		if (!Number.isNaN(at)) return at;
	}
	const reset = Number(headers.get('X-RateLimit-Reset'));
	const quotaUsedUp = headers.get('X-RateLimit-Remaining') === '0';
	return quotaUsedUp && reset > 0 ? reset * SECOND_MS : undefined;
}

const MAX_NOTIFICATION_PAGES = 2;

/**
 * Fetch the notification list. With `ifModifiedSince`, GitHub answers 304 when nothing changed,
 * and a 304 does not count against the rate limit.
 */
export async function listNotifications(
	token: string,
	opts: { ifModifiedSince?: string | null },
	budget?: CallBudget
): Promise<NotificationsPage> {
	let url: string | null = '/notifications?per_page=50';
	const items: GhNotification[] = [];
	let first: Response | null = null;
	let laterFailure: Response | null = null;
	for (let page = 0; url && page < MAX_NOTIFICATION_PAGES; page++) {
		if (budget && !budget.take()) break;
		const res = await gh(token, url, {
			headers:
				page === 0 && opts.ifModifiedSince ? { 'If-Modified-Since': opts.ifModifiedSince } : {}
		});
		budget?.noteLimit(res);
		first ??= res;
		if (res.status !== 200) {
			if (page > 0) laterFailure = res;
			break;
		}
		items.push(...((await res.json()) as GhNotification[]));
		url = res.headers.get('Link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
	}
	const res = laterFailure ?? first!;
	return {
		status: res.status,
		items: laterFailure ? [] : items,
		lastModified: laterFailure ? null : res.headers.get('Last-Modified'),
		pollInterval: Number(first!.headers.get('X-Poll-Interval') ?? 60) || 60,
		retryAt: rateLimitRetryAt(res.headers)
	};
}

// ---------------------------------------------------------------------------
// PR and issue facts: one fragment set and one parser for every read (notification poll,
// dashboard search, quick check, peek), so every view sees the same facts (see SubjectFacts).

const CHUNK = 40;

const MAX_STACK_LEVELS_BELOW = 3;
const stackBelowFields = (depth: number): string =>
	depth === 0
		? ''
		: `baseRef { associatedPullRequests(first: 1, states: OPEN) { nodes { number title url isDraft baseRefName author { login } ${stackBelowFields(depth - 1)} } } }`;

const SUBMITTED_REVIEW_STATES = '[APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED]';
const MENTION_EVENTS_READ = 20;
const MENTION_EVENTS = `mentionEvents: timelineItems(itemTypes: [MENTIONED_EVENT], last: ${MENTION_EVENTS_READ}) {
    nodes { ... on MentionedEvent { createdAt actor { login } } }
  }`;

/** Fragments P (pull request) and I (issue). Queries that use them declare `$me: String!`. */
export const SUBJECT_FIELDS = `
fragment P on PullRequest {
  id number title url isDraft state merged closedAt createdAt updatedAt additions deletions reviewDecision mergeable bodyText
  repository { nameWithOwner defaultBranchRef { name } }
  baseRefName ${stackBelowFields(MAX_STACK_LEVELS_BELOW)}
  author { login avatarUrl(size: 48) __typename } authorAssociation
  labels(first: 10) { nodes { name color } }
  assignees(first: 10) { nodes { login } }
  comments(last: 2) { totalCount nodes { author { login __typename } bodyText url createdAt } }
  ${MENTION_EVENTS}
  commits(last: 1) { totalCount nodes { commit { committedDate statusCheckRollup { state } } } }
  reviewRequests(first: 20) { nodes { requestedReviewer { __typename ... on User { login } ... on Team { combinedSlug } } } }
  requestEvents: timelineItems(itemTypes: [REVIEW_REQUESTED_EVENT], last: 3) {
    nodes { ... on ReviewRequestedEvent { createdAt requestedReviewer { __typename ... on User { login } ... on Team { combinedSlug } } } }
  }
  latestReview: reviews(last: 1, states: ${SUBMITTED_REVIEW_STATES}) { nodes { author { login __typename } submittedAt state } }
  myReviews: reviews(author: $me, last: 1, states: ${SUBMITTED_REVIEW_STATES}) { nodes { submittedAt state } }
  verdicts: latestOpinionatedReviews(first: 10) { nodes { author { login } submittedAt state } }
  reviewThreads(first: 50) { nodes { isResolved } }
}
fragment I on Issue {
  id number title url state stateReason closedAt createdAt updatedAt bodyText
  repository { nameWithOwner }
  author { login avatarUrl(size: 48) __typename } authorAssociation
  labels(first: 10) { nodes { name color } }
  assignees(first: 10) { nodes { login } }
  comments(last: 2) { totalCount nodes { author { login __typename } bodyText url createdAt } }
  ${MENTION_EVENTS}
}`;

export interface SubjectRef {
	key: string;
	owner: string;
	repo: string;
	number: number;
}

type Node = Record<string, any>;

const reviewer = (r: Node | null | undefined) =>
	r?.__typename === 'Team'
		? { team: true, name: String(r.combinedSlug ?? '') }
		: { team: false, name: String(r?.login ?? '') };

const COMMENT_CHARS = 280;

const CLOSE_REASONS: Record<string, CloseReason> = {
	COMPLETED: 'completed',
	NOT_PLANNED: 'not_planned',
	DUPLICATE: 'duplicate'
};

const closeReasonOf = (n: Node): CloseReason | null =>
	n.__typename === 'Issue' && n.state === 'CLOSED' ? (CLOSE_REASONS[n.stateReason] ?? null) : null;

const isBotAuthor = (author: Node | null | undefined) =>
	author?.__typename === 'Bot' || isBot(author?.login);

const toComment = (c: Node): LastComment => ({
	author: c.author?.login ?? 'ghost',
	authorIsBot: isBotAuthor(c.author),
	body: String(c.bodyText ?? '').slice(0, COMMENT_CHARS),
	url: c.url,
	createdAt: c.createdAt
});

function openPrsBelowInStack(n: Node): StackLink[] {
	const defaultBranch = n.repository?.defaultBranchRef?.name;
	const seen = new Set<number>([n.number]);
	const links: StackLink[] = [];
	let at: Node = n;
	while (at.baseRefName && at.baseRefName !== defaultBranch) {
		const under: Node | undefined = at.baseRef?.associatedPullRequests?.nodes?.[0];
		if (!under || seen.has(under.number)) break;
		seen.add(under.number);
		links.push({
			number: under.number,
			title: under.title ?? '',
			url: under.url,
			author: under.author?.login ?? 'ghost',
			draft: !!under.isDraft
		});
		at = under;
	}
	return links;
}

const TEAM_MENTION = /@([a-z0-9-]+\/[a-z0-9._-]+)/gi;

const teamsWrittenIn = (text: unknown): string[] =>
	[...String(text ?? '').matchAll(TEAM_MENTION)].map((m) => m[1].toLowerCase());

function newestMentionOf(n: Node, me: string): string | null {
	const mine = (n.mentionEvents?.nodes ?? []).filter(
		(e: Node) => e?.createdAt && sameLogin(e.actor?.login, me)
	);
	return mine.at(-1)?.createdAt ?? null;
}

function teamMentionsOf(n: Node, recentComments: Node[], me: string): TeamMention[] {
	const writings = [
		{ author: n.author, text: n.bodyText, at: n.createdAt },
		...recentComments.map((c) => ({ author: c.author, text: c.bodyText, at: c.createdAt }))
	].filter((w) => w.at && !isBotAuthor(w.author) && !sameLogin(w.author?.login, me));
	const newestPerTeam = new Map<string, string>();
	for (const w of writings)
		for (const team of teamsWrittenIn(w.text)) newestPerTeam.set(team, w.at);
	return [...newestPerTeam].map(([team, at]) => ({ team, at }));
}

/** A PR or issue node (fragments P and I) as SubjectFacts. */
export function toSubject(n: Node, me: string): SubjectFacts {
	const pr = n.__typename === 'PullRequest';
	const recentComments: Node[] = (n.comments?.nodes ?? []).filter(Boolean);
	const c = recentComments.at(-1);
	const previous = recentComments.length > 1 ? recentComments.at(-2) : undefined;
	const commit = n.commits?.nodes?.[0]?.commit;
	const latest = n.latestReview?.nodes?.[0];
	const mine = n.myReviews?.nodes?.[0];
	return {
		id: n.id,
		kind: pr ? 'pr' : 'issue',
		repo: n.repository?.nameWithOwner ?? '',
		number: n.number,
		title: n.title ?? '',
		url: n.url,
		author: n.author?.login ?? 'ghost',
		authorAvatar: n.author?.avatarUrl ?? null,
		authorIsBot: isBotAuthor(n.author),
		authorAssociation: n.authorAssociation ?? null,
		createdAt: n.createdAt,
		updatedAt: n.updatedAt,
		state: n.merged ? 'merged' : n.state === 'CLOSED' ? 'closed' : 'open',
		closedAt: n.closedAt ?? null,
		closeReason: closeReasonOf(n),
		draft: !!n.isDraft,
		labels: (n.labels?.nodes ?? []).map((l: Node) => ({ name: l.name, color: l.color })),
		assignees: (n.assignees?.nodes ?? []).map((a: Node) => a.login),
		comments: n.comments?.totalCount ?? 0,
		commits: pr ? (n.commits?.totalCount ?? 0) : 0,
		lastComment: c ? toComment(c) : null,
		previousComment: previous ? toComment(previous) : null,
		body: bodyExcerpt(n.bodyText),
		ci: pr ? ((commit?.statusCheckRollup?.state as CiState | undefined) ?? null) : null,
		reviewDecision: pr ? (n.reviewDecision ?? null) : null,
		mergeable: pr ? (n.mergeable ?? null) : null,
		additions: n.additions ?? 0,
		deletions: n.deletions ?? 0,
		lastCommitAt: commit?.committedDate ?? null,
		reviewRequests: (n.reviewRequests?.nodes ?? [])
			.map((r: Node) => reviewer(r.requestedReviewer))
			.filter((r: { name: string }) => r.name),
		requestEvents: (n.requestEvents?.nodes ?? [])
			.filter((e: Node) => e?.createdAt && e.requestedReviewer)
			.map((e: Node) => ({ at: e.createdAt, ...reviewer(e.requestedReviewer) })),
		mentionedAt: newestMentionOf(n, me),
		teamMentions: teamMentionsOf(n, recentComments, me),
		myReview: mine?.submittedAt ? { at: mine.submittedAt, state: mine.state } : null,
		latestReview: latest
			? {
					author: latest.author?.login ?? 'ghost',
					authorIsBot: isBotAuthor(latest.author),
					at: latest.submittedAt,
					state: latest.state
				}
			: null,
		verdicts: (n.verdicts?.nodes ?? [])
			.filter((v: Node) => v?.author?.login && v.submittedAt)
			.map((v: Node) => ({ by: v.author.login, at: v.submittedAt, state: v.state })),
		openThreads: pr
			? (n.reviewThreads?.nodes ?? []).filter((t: Node) => t && t.isResolved === false).length
			: 0,
		...(pr && { stackBelowNearestFirst: openPrsBelowInStack(n) })
	};
}

export interface SubjectReads {
	subjects: Map<string, SubjectFacts>;
	deletedOrNoAccess: Set<string>;
	githubDidNotAnswer: Set<string>;
	errors: string[];
}

function subjectsQuery(me: string, chunk: SubjectRef[]) {
	const variables: Record<string, string | number> = { me };
	const decl: string[] = ['$me: String!'];
	const body: string[] = [];
	chunk.forEach((r, j) => {
		variables[`o${j}`] = r.owner;
		variables[`r${j}`] = r.repo;
		variables[`n${j}`] = r.number;
		decl.push(`$o${j}: String!, $r${j}: String!, $n${j}: Int!`);
		body.push(
			`t${j}: repository(owner: $o${j}, name: $r${j}) { issueOrPullRequest(number: $n${j}) { __typename ...P ...I } }`
		);
	});
	return {
		query: `query(${decl.join(', ')}) {\n${body.join('\n')}\n}\n${SUBJECT_FIELDS}`,
		variables
	};
}

const isDeletedOrNoAccess = (node: Node | null | undefined, errors: GraphqlError[]) =>
	(node === null && !errors.length) ||
	(errors.length > 0 &&
		errors.every((error) => error.type === 'NOT_FOUND' || error.type === 'FORBIDDEN') &&
		errors.every((error) => !!error.path?.length && error.path.length <= 2));

export async function fetchSubjects(
	token: string,
	refs: SubjectRef[],
	me: string
): Promise<SubjectReads> {
	const subjects = new Map<string, SubjectFacts>();
	const deletedOrNoAccess = new Set<string>();
	const githubDidNotAnswer = new Set<string>();
	const errors: string[] = [];
	await inRequests(
		token,
		refs,
		CHUNK,
		(chunk) => subjectsQuery(me, chunk),
		(chunk, data, graphqlErrors) =>
			chunk.forEach((r, j) => {
				const path = [`t${j}`, 'issueOrPullRequest'];
				const node = data?.[`t${j}`]?.issueOrPullRequest;
				const errorsHere = graphqlErrors.filter((error) => hasGraphqlErrorAt([error], path));
				if (isDeletedOrNoAccess(node, errorsHere)) deletedOrNoAccess.add(r.key);
				if (node?.id && !hasGraphqlErrorAt(graphqlErrors, path))
					subjects.set(r.key, toSubject(node, me));
			}),
		errors,
		(chunk) => chunk.forEach((r) => githubDidNotAnswer.add(r.key))
	);
	return {
		subjects,
		deletedOrNoAccess,
		githubDidNotAnswer,
		errors: [...new Set(errors)].slice(0, 3)
	};
}

// ---------------------------------------------------------------------------
// Teams and dashboard searches.

export async function fetchTeams(
	token: string,
	login: string,
	budget?: CallBudget
): Promise<{ teams: TeamDTO[]; error?: string }> {
	const query = `query($login: String!) {
  viewer { organizations(first: 50) { nodes { login teams(first: 100, userLogins: [$login]) { nodes { combinedSlug name } } } } }
}`;
	const result = await graphql(token, query, { login }, budget);
	if (!result.ok) return { teams: [], error: `GitHub returned ${result.status} for your teams.` };
	const teams: TeamDTO[] = [];
	for (const org of result.data?.viewer?.organizations?.nodes ?? []) {
		for (const t of org?.teams?.nodes ?? [])
			teams.push({ slug: t.combinedSlug, name: t.name, org: org.login });
	}
	teams.sort((a, b) => a.slug.localeCompare(b.slug));
	return {
		teams,
		error: hasGraphqlErrorAt(result.errors, ['viewer']) ? result.errors[0].message : undefined
	};
}

/** GitHub's answers when a request took too long (it stops after about 10 seconds). */
const TIMED_OUT = new Set([502, 504]);

/**
 * Send items in GraphQL requests of `size`. A request that GitHub stopped (too slow) is sent
 * again in two halves, down to one item. `use` reads each answer; failures go to `errors`.
 */
async function inRequests<T>(
	token: string,
	items: T[],
	size: number,
	build: (chunk: T[]) => { query: string; variables: Record<string, unknown> },
	use: (chunk: T[], data: Record<string, Node | null> | undefined, errors: GraphqlError[]) => void,
	errors: string[],
	failed: (chunk: T[]) => void = () => {},
	budget?: CallBudget
): Promise<void> {
	async function ask(chunk: T[]): Promise<void> {
		const { query, variables } = build(chunk);
		const result = await graphql<Record<string, Node | null>>(
			token,
			query,
			variables,
			budget
		).catch(() => null);
		if (!result) {
			failed(chunk);
			return void errors.push('GitHub did not answer. Hush tries again on the next refresh.');
		}
		if (result.status === NO_CALL_LEFT) return failed(chunk);
		if (TIMED_OUT.has(result.status) && chunk.length > 1 && budget?.open !== false) {
			const half = Math.ceil(chunk.length / 2);
			await ask(chunk.slice(0, half));
			await ask(chunk.slice(half));
			return;
		}
		if (!result.ok) {
			failed(chunk);
			return void errors.push(
				TIMED_OUT.has(result.status)
					? 'GitHub took too long to answer. Hush tries again on the next refresh.'
					: githubStatusMessage(result.status)
			);
		}
		for (const e of result.errors) errors.push(e.message);
		use(chunk, result.data, result.errors);
	}
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
	if (!budget) {
		await Promise.all(chunks.map(ask));
		return;
	}
	for (const chunk of chunks) await ask(chunk);
}

/** Results for each dashboard search (it asks for no more). */
const SEARCH_MAX = SOURCE_RESULTS_MAX;
/** Short searches in one request: their answers are small. */
const SEARCH_CHUNK = 10;
/** Items with all their details in one request: these answers are big. */
const DETAILS_CHUNK = 20;

/** One result of a short search: enough to know if Hush must read it again. */
export interface SearchHit {
	query: ExpandedQuery;
	/** The GraphQL node ID. */
	id: string;
	/** "owner/repo#123". */
	key: string;
	updatedAt: string;
}

const SHORT = `__typename
  ... on PullRequest { id number updatedAt repository { nameWithOwner } }
  ... on Issue { id number updatedAt repository { nameWithOwner } }`;

/**
 * Step 1 of a dashboard refresh: run the searches, for IDs and update times only. Many fit in
 * one request; the details come after, only for what needs them (fetchDetails).
 */
export async function searchShort(
	token: string,
	queries: ExpandedQuery[],
	budget?: CallBudget
): Promise<{
	hits: SearchHit[];
	errors: string[];
	failedSections: Set<string>;
	failedQueries: ExpandedQuery[];
}> {
	const errors: string[] = [];
	const hits: SearchHit[] = [];
	const failedSections = new Set<string>();
	const failedQueries: ExpandedQuery[] = [];
	await inRequests(
		token,
		queries,
		SEARCH_CHUNK,
		(chunk) => ({
			query: `query(${chunk.map((_, j) => `$q${j}: String!`).join(', ')}) {\n${chunk
				.map(
					(_, j) =>
						`s${j}: search(type: ISSUE, query: $q${j}, first: ${SEARCH_MAX}) { nodes { ${SHORT} } }`
				)
				.join('\n')}\n}`,
			variables: Object.fromEntries(chunk.map((q, j) => [`q${j}`, newestFirst(q.q)]))
		}),
		(chunk, data, graphqlErrors) =>
			chunk.forEach((q, j) => {
				if (!data?.[`s${j}`] || hasGraphqlErrorAt(graphqlErrors, [`s${j}`])) {
					failedSections.add(q.section);
					failedQueries.push(q);
					if (!graphqlErrors.length)
						errors.push('GitHub did not return a view search. Hush tries again later.');
					return;
				}
				for (const n of data?.[`s${j}`]?.nodes ?? [])
					if (n?.id && n.repository?.nameWithOwner)
						hits.push({
							query: q,
							id: n.id,
							key: `${n.repository.nameWithOwner}#${n.number}`,
							updatedAt: n.updatedAt
						});
			}),
		errors,
		(chunk) =>
			chunk.forEach((query) => {
				failedSections.add(query.section);
				failedQueries.push(query);
			}),
		budget
	);
	return { hits, errors: [...new Set(errors)].slice(0, 3), failedSections, failedQueries };
}

export async function searchCounts(token: string, queries: string[]): Promise<(number | null)[]> {
	if (!queries.length) return [];
	const result = await graphql<Record<string, { issueCount: number } | null>>(
		token,
		`query(${queries.map((_, j) => `$q${j}: String!`).join(', ')}) {\n${queries
			.map((_, j) => `c${j}: search(type: ISSUE, query: $q${j}, first: 0) { issueCount }`)
			.join('\n')}\n}`,
		Object.fromEntries(queries.map((q, j) => [`q${j}`, q]))
	);
	if (!result.ok) throw new GitHubError(result.status, githubStatusMessage(result.status));
	return queries.map((_, j) => result.data?.[`c${j}`]?.issueCount ?? null);
}

/** Step 2: the full facts of these PRs and issues (by node ID). Missing ones are left out. */
export async function fetchDetails(
	token: string,
	me: string,
	ids: string[]
): Promise<{ subjects: Map<string, SubjectFacts>; errors: string[] }> {
	const errors: string[] = [];
	const subjects = new Map<string, SubjectFacts>();
	await inRequests(
		token,
		ids,
		DETAILS_CHUNK,
		(chunk) => ({
			query: `query($me: String!, $ids: [ID!]!) { nodes(ids: $ids) { __typename ...P ...I } }\n${SUBJECT_FIELDS}`,
			variables: { me, ids: chunk }
		}),
		(_, data, errors) => {
			((data?.nodes as unknown as Node[] | undefined) ?? []).forEach((n, index) => {
				if (n?.id && !hasGraphqlErrorAt(errors, ['nodes', index]))
					subjects.set(n.id, toSubject(n, me));
			});
		},
		errors
	);
	return { subjects, errors: [...new Set(errors)].slice(0, 3) };
}

export interface ItemReads {
	read: SubjectFacts[];
	inaccessible: string[];
	failed: string[];
	errors: string[];
}

export async function fetchItems(
	token: string,
	me: string,
	ids: string[],
	budget?: CallBudget
): Promise<ItemReads> {
	const read: SubjectFacts[] = [];
	const inaccessible: string[] = [];
	const failed = new Set<string>();
	const errors: string[] = [];
	await inRequests(
		token,
		ids,
		DETAILS_CHUNK,
		(chunk) => ({
			query: `query($me: String!, $ids: [ID!]!) { nodes(ids: $ids) { __typename ...P ...I } }\n${SUBJECT_FIELDS}`,
			variables: { me, ids: chunk }
		}),
		(chunk, data, graphqlErrors) => {
			const nodes = (data?.nodes as unknown as (Node | null)[] | undefined) ?? [];
			chunk.forEach((id, index) => {
				const node = nodes[index];
				const errorsHere = graphqlErrors.filter((error) =>
					hasGraphqlErrorAt([error], ['nodes', index])
				);
				if (node?.id && !errorsHere.length) read.push(toSubject(node, me));
				else if (data && isDeletedOrNoAccess(node, errorsHere)) inaccessible.push(id);
				else failed.add(id);
			});
		},
		errors,
		(chunk) => chunk.forEach((id) => failed.add(id)),
		budget
	);
	return { read, inaccessible, failed: [...failed], errors: [...new Set(errors)].slice(0, 3) };
}

/** Details of an item that did not change are read again after this long, as a safety net. */
export const DETAILS_TTL = HOUR_MS;

/**
 * Must the refresh read this item's details again? Yes when Hush has none, when it changed on
 * GitHub, when its CI still runs (a CI result does not change the PR's update time), when the
 * last read is old, or on a full refresh (the Refresh button).
 */
export function needsDetails(
	stored: SubjectFacts | undefined,
	updatedAt: string,
	readAt: number | undefined,
	now: number,
	full: boolean
): boolean {
	return (
		full ||
		!stored ||
		stored.updatedAt !== updatedAt ||
		ciRunning(stored.ci) ||
		now - (readAt ?? 0) > DETAILS_TTL
	);
}

/** A team search keeps only the PRs that request one of its teams (see expandSections). */
export const forTeams = (q: ExpandedQuery, s: SubjectFacts, me: string) =>
	!q.teams ||
	s.reviewRequests.some((r) => r.team && q.teams!.some((t) => sameLogin(t, r.name))) ||
	(!!q.orDirect && requestedByName(s.reviewRequests, me));

// ---------------------------------------------------------------------------
// Peek: one PR or issue with its description, checks, and latest comments. About 1 point.

const PEEK_TIMELINE = 10;

const PERSON = `login avatarUrl(size: 48) __typename`;

// The peek also asks for fragments P and I, so each peek refreshes the stored facts too.
const PEEK_QUERY = `query($me: String!, $o: String!, $r: String!, $n: Int!) {
  repository(owner: $o, name: $r) { issueOrPullRequest(number: $n) {
    __typename ...P ...I
    ... on PullRequest {
      id number title url state isDraft merged createdAt bodyHTML additions deletions changedFiles
      baseRefName headRefName headRefOid headRepository { nameWithOwner } reviewDecision mergeable mergeStateStatus locked
      ${REACTION_FIELDS}
      viewerDidAuthor viewerCanClose viewerCanReopen viewerCanUpdate viewerCanMergeAsAdmin
      viewerCanEnableAutoMerge viewerCanDisableAutoMerge autoMergeRequest { mergeMethod }
      repository { nameWithOwner viewerPermission mergeCommitAllowed squashMergeAllowed rebaseMergeAllowed }
      author { ${PERSON} }
      labels(first: 10) { nodes { name color } }
      assignees(first: 10) { nodes { login } }
      latestOpinionatedReviews(first: 20) { nodes { state author { ${PERSON} } } }
      viewerLatestReview { submittedAt commit { oid } }
      reviewThreads(first: 50) { nodes { isResolved } }
      reviewRequests(first: 20) { nodes { requestedReviewer { __typename ... on User { login } ... on Team { name combinedSlug } } } }
      commits(last: 1) { nodes { commit { statusCheckRollup { state contexts(first: 100) {
        totalCount
        nodes {
          __typename
          ... on CheckRun { name status conclusion detailsUrl checkSuite { workflowRun { databaseId } } }
          ... on StatusContext { context state targetUrl }
        }
      } } } } }
      timelineItems(last: ${PEEK_TIMELINE}, itemTypes: [ISSUE_COMMENT, PULL_REQUEST_REVIEW]) {
        totalCount
        nodes {
          __typename
          ... on IssueComment { author { ${PERSON} } body bodyHTML viewerDidAuthor viewerCanUpdate createdAt url ${REACTION_FIELDS} }
          ... on PullRequestReview { author { ${PERSON} } body bodyHTML viewerDidAuthor viewerCanUpdate state submittedAt createdAt url comments { totalCount } ${REACTION_FIELDS} }
        }
      }
    }
    ... on Issue {
      id number title url state createdAt bodyHTML locked ${REACTION_FIELDS}
      viewerDidAuthor viewerCanClose viewerCanReopen
      repository { nameWithOwner viewerPermission }
      author { ${PERSON} }
      labels(first: 10) { nodes { name color } }
      assignees(first: 10) { nodes { login } }
      timelineItems(last: ${PEEK_TIMELINE}, itemTypes: [ISSUE_COMMENT]) {
        totalCount
        nodes { __typename ... on IssueComment { author { ${PERSON} } body bodyHTML viewerDidAuthor viewerCanUpdate createdAt url ${REACTION_FIELDS} } }
      }
    }
  } }
}
${SUBJECT_FIELDS}`;

const person = (a: Node | null | undefined): PeekPerson => ({
	login: a?.login ?? 'ghost',
	avatar: a?.avatarUrl ?? null,
	bot: isBotAuthor(a)
});

const PEEK_AVATAR_SIZE = '48';

export interface RestFullMediaTimelineEntry {
	node_id: string;
	html_url: string;
	body_html?: string;
	body?: string;
	created_at?: string;
	submitted_at?: string;
	state?: PeekEntry['state'];
	user: { login: string; avatar_url: string; type: string } | null;
}

function restAvatar(url: string): string {
	const sized = new URL(url);
	sized.searchParams.set('s', PEEK_AVATAR_SIZE);
	return sized.toString();
}

export function peekEntryFromRest(
	type: PeekEntry['type'],
	j: RestFullMediaTimelineEntry,
	now = new Date()
): PeekEntry {
	return {
		type,
		id: j.node_id,
		author: {
			login: j.user?.login ?? 'ghost',
			avatar: j.user ? restAvatar(j.user.avatar_url) : null,
			bot: j.user?.type === 'Bot' || isBot(j.user?.login)
		},
		at: j.submitted_at ?? j.created_at ?? now.toISOString(),
		url: j.html_url,
		html: j.body_html ?? '',
		body: j.body ?? '',
		canEdit: typeof j.body === 'string',
		...(type === 'review' ? { state: j.state ?? 'COMMENTED', inline: 0 } : {}),
		reactions: { id: j.node_id, canReact: true, groups: [] }
	};
}

function checkState(n: Node): CheckState {
	if (n.__typename === 'StatusContext') return ciWord(n.state as CiState) ?? 'failure';
	if (n.status !== 'COMPLETED') return 'pending';
	switch (n.conclusion) {
		case 'SUCCESS':
			return 'success';
		case 'NEUTRAL':
		case 'SKIPPED':
		case 'STALE':
			return 'neutral';
		default:
			return 'failure';
	}
}

const CHECK_ORDER: Record<CheckState, number> = { failure: 0, pending: 1, neutral: 2, success: 3 };

/**
 * Fetch one PR or issue for the peek panel, with its facts for the store. Returns null when it
 * does not exist or is hidden.
 */
export async function fetchPeek(
	token: string,
	me: string,
	owner: string,
	repo: string,
	number: number
): Promise<{ peek: PeekDTO; subject: SubjectFacts | null } | null> {
	const result = await graphql(token, PEEK_QUERY, { me, o: owner, r: repo, n: number });
	if (!result.ok) throw new GitHubError(result.status, githubStatusMessage(result.status));
	const n: Node | null | undefined = result.data?.repository?.issueOrPullRequest;
	if (!n) {
		if (result.errors.length && result.data?.repository !== null)
			throw new GitHubError(502, result.errors[0].message);
		return null;
	}
	const pr = n.__typename === 'PullRequest';
	const parsedSubject = toSubject(n, me);
	const subject = hasGraphqlErrorAt(result.errors, ['repository', 'issueOrPullRequest'])
		? null
		: parsedSubject;
	const items: PeekEntry[] = (n.timelineItems?.nodes ?? [])
		.filter((t: Node) => t?.__typename)
		.map((t: Node) =>
			t.__typename === 'PullRequestReview'
				? {
						type: 'review',
						id: t.id,
						author: person(t.author),
						at: t.submittedAt ?? t.createdAt,
						url: t.url,
						html: t.bodyHTML ?? '',
						body: t.body ?? '',
						canEdit: !!t.viewerDidAuthor && !!t.viewerCanUpdate && !!t.body?.trim(),
						state: t.state,
						inline: t.comments?.totalCount ?? 0,
						reactions: reactionsOf(t)
					}
				: {
						type: 'comment',
						id: t.id,
						author: person(t.author),
						at: t.createdAt,
						url: t.url,
						html: t.bodyHTML ?? '',
						body: t.body ?? '',
						canEdit: !!t.viewerDidAuthor && !!t.viewerCanUpdate,
						reactions: reactionsOf(t)
					}
		);
	const base: PeekDTO = {
		kind: pr ? 'pr' : 'issue',
		number: n.number,
		title: n.title,
		url: n.url,
		repo: n.repository?.nameWithOwner ?? `${owner}/${repo}`,
		state: n.merged ? 'merged' : n.state === 'CLOSED' ? 'closed' : 'open',
		draft: !!n.isDraft,
		author: person(n.author),
		authorAssociation: n.authorAssociation ?? null,
		createdAt: n.createdAt,
		html: n.bodyHTML ?? '',
		reactions: reactionsOf(n),
		labels: (n.labels?.nodes ?? []).map((l: Node) => ({ name: l.name, color: l.color })),
		assignees: (n.assignees?.nodes ?? []).map((a: Node) => a.login),
		timeline: { total: n.timelineItems?.totalCount ?? items.length, items },
		can: {
			id: n.id,
			author: !!n.viewerDidAuthor,
			close: !!n.viewerCanClose,
			reopen: !!n.viewerCanReopen,
			update: !!n.viewerCanUpdate,
			comment: !n.locked || hasWritePermission(n.repository?.viewerPermission),
			permission: n.repository?.viewerPermission ?? null
		}
	};
	if (!pr) return { peek: base, subject };

	const rollup = n.commits?.nodes?.[0]?.commit?.statusCheckRollup;
	const checks = (rollup?.contexts?.nodes ?? [])
		.filter((c: Node) => c?.__typename)
		.map((c: Node) => ({
			name: c.__typename === 'CheckRun' ? c.name : c.context,
			state: checkState(c),
			url: (c.__typename === 'CheckRun' ? c.detailsUrl : c.targetUrl) ?? null
		}))
		.sort(
			(a: { state: CheckState }, b: { state: CheckState }) =>
				CHECK_ORDER[a.state] - CHECK_ORDER[b.state]
		);
	const r = n.repository ?? {};
	const failedRuns = [
		...new Set<number>(
			(rollup?.contexts?.nodes ?? [])
				.filter((c: Node) => c?.__typename === 'CheckRun' && checkState(c) === 'failure')
				.map((c: Node) => c.checkSuite?.workflowRun?.databaseId)
				.filter((id: unknown): id is number => typeof id === 'number')
		)
	];
	base.can.pr = {
		headOid: n.headRefOid,
		mergeState: n.mergeStateStatus ?? 'UNKNOWN',
		methods: [
			...(r.squashMergeAllowed ? ['SQUASH' as const] : []),
			...(r.mergeCommitAllowed ? ['MERGE' as const] : []),
			...(r.rebaseMergeAllowed ? ['REBASE' as const] : [])
		],
		mergeAsAdmin: !!n.viewerCanMergeAsAdmin,
		autoMerge: {
			on: !!n.autoMergeRequest,
			method: n.autoMergeRequest?.mergeMethod ?? null,
			canEnable: !!n.viewerCanEnableAutoMerge,
			canDisable: !!n.viewerCanDisableAutoMerge
		},
		failedRuns,
		stack:
			n.state === 'OPEN'
				? await readStack(token, `${owner}/${repo}`, {
						number: n.number,
						head: n.headRefName,
						base: n.baseRefName,
						defaultBranch: r.defaultBranchRef?.name ?? ''
					}).catch(() => NO_STACK)
				: NO_STACK
	};
	const peek: PeekDTO = {
		...base,
		pr: {
			base: n.baseRefName,
			head: n.headRefName,
			headRepo: n.headRepository?.nameWithOwner ?? null,
			additions: n.additions ?? 0,
			deletions: n.deletions ?? 0,
			files: n.changedFiles ?? 0,
			openThreads: parsedSubject.openThreads,
			reviewDecision: n.reviewDecision ?? null,
			mergeable: n.mergeable ?? null,
			reviews: (n.latestOpinionatedReviews?.nodes ?? []).map((r: Node) => ({
				who: person(r.author),
				state: r.state
			})),
			requested: (n.reviewRequests?.nodes ?? [])
				.map((r: Node) => r.requestedReviewer)
				.filter(Boolean)
				.map((r: Node) => ({
					name: r.login ?? r.name,
					team: r.__typename === 'Team',
					slug: r.combinedSlug ?? null
				})),
			ci: (rollup?.state as CiState | undefined) ?? null,
			checks,
			checksTotal: rollup?.contexts?.totalCount ?? checks.length,
			lastReview: n.viewerLatestReview?.commit?.oid
				? { oid: n.viewerLatestReview.commit.oid, at: n.viewerLatestReview.submittedAt }
				: null
		}
	};
	return { peek, subject };
}
