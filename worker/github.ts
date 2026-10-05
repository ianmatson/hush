import type {
	CheckState,
	CiState,
	LastComment,
	PeekDTO,
	PeekEntry,
	PeekPerson,
	StackLink,
	TeamDTO
} from '../src/lib/shared/types';
import { newestFirst, SOURCE_RESULTS_MAX } from '../src/lib/shared/sources';
import { isBot } from '../src/lib/shared/classify';
import { bodyExcerpt } from '../src/lib/shared/decisions';
import { REACTION_FIELDS, reactionsOf } from '../src/lib/shared/reactions';
import type { ExpandedQuery } from '../src/lib/shared/dashboard';
import type { SubjectFacts } from '../src/lib/shared/subject';

const API = 'https://api.github.com';
const UA = 'hush-notifications (+https://github.com)';

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
		return await fetch(url, { ...init, headers, signal: noAnswer.signal });
	} finally {
		clearTimeout(waitForAnswer);
	}
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

/** API subject URL → github.com URL. */
export function subjectHtmlUrl(n: GhNotification): string {
	const repo = n.repository.html_url;
	const u = n.subject.url;
	switch (n.subject.type) {
		case 'PullRequest':
		case 'Issue':
		case 'Commit':
			if (u)
				return u
					.replace('https://api.github.com/repos/', 'https://github.com/')
					.replace('/pulls/', '/pull/')
					.replace('/commits/', '/commit/');
			return repo;
		case 'Release':
			return `${repo}/releases`;
		case 'Discussion':
			return `${repo}/discussions`;
		case 'CheckSuite':
			return `${repo}/actions`;
		case 'RepositoryVulnerabilityAlert':
		case 'RepositoryDependabotAlertsThread':
			return `${repo}/security/dependabot`;
		default:
			return repo;
	}
}

export function subjectNumber(n: GhNotification): number | null {
	if (n.subject.type !== 'PullRequest' && n.subject.type !== 'Issue') return null;
	const m = n.subject.url?.match(/\/(?:pulls|issues)\/(\d+)$/);
	return m ? Number(m[1]) : null;
}

export interface NotificationsPage {
	status: number;
	items: GhNotification[];
	lastModified: string | null;
	pollInterval: number;
	resetAt?: number;
	/** Org ids that GitHub left out because the token is not SAML-authorized for them. */
	ssoHiddenOrgs: string[];
	/** Every page was read (no "next" page was left). */
	complete: boolean;
}

/** Parse `X-GitHub-SSO: partial-results; organizations=1,2`. */
export function parseSsoHeader(value: string | null): string[] {
	const m = value?.match(/partial-results;\s*organizations=([\d,\s]+)/i);
	return m
		? m[1]
				.split(',')
				.map((x) => x.trim())
				.filter(Boolean)
		: [];
}

/**
 * Fetch the notification list. With `ifModifiedSince`, GitHub answers 304 when nothing changed,
 * and a 304 does not count against the rate limit.
 */
export async function listNotifications(
	token: string,
	opts: { ifModifiedSince?: string | null; all?: boolean; since?: string; maxPages?: number }
): Promise<NotificationsPage> {
	const params = new URLSearchParams({ per_page: '50' });
	if (opts.all) params.set('all', 'true');
	if (opts.since) params.set('since', opts.since);
	let url: string | null = `/notifications?${params}`;
	const items: GhNotification[] = [];
	let first: Response | null = null;
	for (let page = 0; url && page < (opts.maxPages ?? 2); page++) {
		const res = await gh(token, url, {
			headers:
				page === 0 && opts.ifModifiedSince ? { 'If-Modified-Since': opts.ifModifiedSince } : {}
		});
		first ??= res;
		if (res.status !== 200) break;
		items.push(...((await res.json()) as GhNotification[]));
		url = res.headers.get('Link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
	}
	const res = first!;
	const reset = res.headers.get('X-RateLimit-Reset');
	return {
		status: res.status,
		items,
		lastModified: res.headers.get('Last-Modified'),
		pollInterval: Number(res.headers.get('X-Poll-Interval') ?? 60) || 60,
		resetAt: reset ? Number(reset) * 1000 : undefined,
		ssoHiddenOrgs: parseSsoHeader(res.headers.get('X-GitHub-SSO')),
		complete: res.status === 200 && url === null
	};
}

export const markThreadRead = (token: string, id: string) =>
	gh(token, `/notifications/threads/${encodeURIComponent(id)}`, { method: 'PATCH' });

export const markThreadDone = (token: string, id: string) =>
	gh(token, `/notifications/threads/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const muteThread = (token: string, id: string) =>
	gh(token, `/notifications/threads/${encodeURIComponent(id)}/subscription`, {
		method: 'PUT',
		body: JSON.stringify({ ignored: true })
	});

// ---------------------------------------------------------------------------
// PR and issue facts: one fragment set and one parser for every read (inbox enrichment, watcher,
// dashboard search, quick check, peek), so every view sees the same facts (see SubjectFacts).

const CHUNK = 40;

const MAX_STACK_LEVELS_BELOW = 3;
const stackBelowFields = (depth: number): string =>
	depth === 0
		? ''
		: `baseRef { associatedPullRequests(first: 1, states: OPEN) { nodes { number title url isDraft baseRefName author { login } ${stackBelowFields(depth - 1)} } } }`;

/** Fragments P (pull request) and I (issue). Queries that use them declare `$me: String!`. */
export const SUBJECT_FIELDS = `
fragment P on PullRequest {
  id number title url isDraft state merged createdAt updatedAt additions deletions reviewDecision mergeable bodyText
  repository { nameWithOwner defaultBranchRef { name } }
  baseRefName ${stackBelowFields(MAX_STACK_LEVELS_BELOW)}
  author { login avatarUrl(size: 48) __typename }
  labels(first: 10) { nodes { name color } }
  assignees(first: 10) { nodes { login } }
  comments(last: 2) { totalCount nodes { author { login __typename } bodyText url createdAt } }
  commits(last: 1) { totalCount nodes { commit { committedDate statusCheckRollup { state } } } }
  reviewRequests(first: 20) { nodes { requestedReviewer { __typename ... on User { login } ... on Team { combinedSlug } } } }
  requestEvents: timelineItems(itemTypes: [REVIEW_REQUESTED_EVENT], last: 3) {
    nodes { ... on ReviewRequestedEvent { createdAt requestedReviewer { __typename ... on User { login } ... on Team { combinedSlug } } } }
  }
  latestReview: reviews(last: 1) { nodes { author { login } submittedAt state } }
  myReviews: reviews(author: $me, last: 1) { nodes { submittedAt state } }
  verdicts: latestOpinionatedReviews(first: 10) { nodes { author { login } submittedAt state } }
  reviewThreads(first: 50) { nodes { isResolved } }
}
fragment I on Issue {
  id number title url state createdAt updatedAt bodyText
  repository { nameWithOwner }
  author { login avatarUrl(size: 48) __typename }
  labels(first: 10) { nodes { name color } }
  assignees(first: 10) { nodes { login } }
  comments(last: 2) { totalCount nodes { author { login __typename } bodyText url createdAt } }
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

const toComment = (c: Node): LastComment => ({
	author: c.author?.login ?? 'ghost',
	authorIsBot: c.author?.__typename === 'Bot' || isBot(c.author?.login),
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

/** A PR or issue node (fragments P and I) as SubjectFacts. */
export function toSubject(n: Node): SubjectFacts {
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
		authorIsBot: n.author?.__typename === 'Bot' || isBot(n.author?.login),
		createdAt: n.createdAt,
		updatedAt: n.updatedAt,
		state: n.merged ? 'merged' : n.state === 'CLOSED' ? 'closed' : 'open',
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
		myReview: mine?.submittedAt ? { at: mine.submittedAt, state: mine.state } : null,
		latestReview: latest
			? { author: latest.author?.login ?? 'ghost', at: latest.submittedAt, state: latest.state }
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

/** Fetch PRs and issues (40 per request). Subjects that fail (no access, SAML, deleted) are left out. */
export async function fetchSubjects(
	token: string,
	refs: SubjectRef[],
	me: string
): Promise<Map<string, SubjectFacts>> {
	const out = new Map<string, SubjectFacts>();
	for (let i = 0; i < refs.length; i += CHUNK) {
		const chunk = refs.slice(i, i + CHUNK);
		const vars: Record<string, string | number> = { me };
		const decl: string[] = ['$me: String!'];
		const body: string[] = [];
		chunk.forEach((r, j) => {
			vars[`o${j}`] = r.owner;
			vars[`r${j}`] = r.repo;
			vars[`n${j}`] = r.number;
			decl.push(`$o${j}: String!, $r${j}: String!, $n${j}: Int!`);
			body.push(
				`t${j}: repository(owner: $o${j}, name: $r${j}) { issueOrPullRequest(number: $n${j}) { __typename ...P ...I } }`
			);
		});
		const query = `query(${decl.join(', ')}) {\n${body.join('\n')}\n}\n${SUBJECT_FIELDS}`;
		const res = await gh(token, '/graphql', {
			method: 'POST',
			body: JSON.stringify({ query, variables: vars })
		});
		if (!res.ok) continue;
		const json = (await res.json()) as { data?: Record<string, Node | null> };
		chunk.forEach((r, j) => {
			const node = json.data?.[`t${j}`]?.issueOrPullRequest;
			if (node?.id) out.set(r.key, toSubject(node));
		});
	}
	return out;
}

// ---------------------------------------------------------------------------
// Teams and dashboard searches.

export async function fetchTeams(
	token: string,
	login: string
): Promise<{ teams: TeamDTO[]; error?: string }> {
	const query = `query($login: String!) {
  viewer { organizations(first: 50) { nodes { login teams(first: 100, userLogins: [$login]) { nodes { combinedSlug name } } } } }
}`;
	const res = await gh(token, '/graphql', {
		method: 'POST',
		body: JSON.stringify({ query, variables: { login } })
	});
	if (!res.ok) return { teams: [], error: `GitHub returned ${res.status} for your teams.` };
	const json = (await res.json()) as { data?: Node; errors?: { message: string }[] };
	const teams: TeamDTO[] = [];
	for (const org of json.data?.viewer?.organizations?.nodes ?? []) {
		for (const t of org?.teams?.nodes ?? [])
			teams.push({ slug: t.combinedSlug, name: t.name, org: org.login });
	}
	teams.sort((a, b) => a.slug.localeCompare(b.slug));
	return {
		teams,
		error: json.errors?.length && !teams.length ? json.errors[0].message : undefined
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
	use: (chunk: T[], data: Record<string, Node | null> | undefined) => void,
	errors: string[]
): Promise<void> {
	async function ask(chunk: T[]): Promise<void> {
		const res = await gh(token, '/graphql', {
			method: 'POST',
			body: JSON.stringify(build(chunk))
		}).catch(() => null);
		if (!res)
			return void errors.push('GitHub did not answer. Hush tries again on the next refresh.');
		if (TIMED_OUT.has(res.status) && chunk.length > 1) {
			const half = Math.ceil(chunk.length / 2);
			await Promise.all([ask(chunk.slice(0, half)), ask(chunk.slice(half))]);
			return;
		}
		if (!res.ok)
			return void errors.push(
				TIMED_OUT.has(res.status)
					? 'GitHub took too long to answer. Hush tries again on the next refresh.'
					: `GitHub returned ${res.status}.`
			);
		// The time limit also covers reading the answer.
		const json = (await res.json().catch(() => null)) as {
			data?: Record<string, Node | null>;
			errors?: { message: string }[];
		} | null;
		if (!json)
			return void errors.push('GitHub did not answer. Hush tries again on the next refresh.');
		for (const e of json.errors ?? []) errors.push(e.message);
		use(chunk, json.data);
	}
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
	await Promise.all(chunks.map(ask));
}

/** Results for each dashboard search (it asks for no more). */
export const SEARCH_MAX = SOURCE_RESULTS_MAX;
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
	queries: ExpandedQuery[]
): Promise<{ hits: SearchHit[]; errors: string[] }> {
	const errors: string[] = [];
	const hits: SearchHit[] = [];
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
		(chunk, data) =>
			chunk.forEach((q, j) => {
				for (const n of data?.[`s${j}`]?.nodes ?? [])
					if (n?.id && n.repository?.nameWithOwner)
						hits.push({
							query: q,
							id: n.id,
							key: `${n.repository.nameWithOwner}#${n.number}`,
							updatedAt: n.updatedAt
						});
			}),
		errors
	);
	return { hits, errors: [...new Set(errors)].slice(0, 3) };
}

export async function searchCounts(token: string, queries: string[]): Promise<(number | null)[]> {
	if (!queries.length) return [];
	const res = await gh(token, '/graphql', {
		method: 'POST',
		body: JSON.stringify({
			query: `query(${queries.map((_, j) => `$q${j}: String!`).join(', ')}) {\n${queries
				.map((_, j) => `c${j}: search(type: ISSUE, query: $q${j}, first: 0) { issueCount }`)
				.join('\n')}\n}`,
			variables: Object.fromEntries(queries.map((q, j) => [`q${j}`, q]))
		})
	});
	if (!res.ok) throw new GitHubError(res.status, `GitHub returned ${res.status}.`);
	const json = (await res.json()) as {
		data?: Record<string, { issueCount: number } | null>;
	};
	return queries.map((_, j) => json.data?.[`c${j}`]?.issueCount ?? null);
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
		(_, data) => {
			for (const n of (data?.nodes as unknown as Node[] | undefined) ?? [])
				if (n?.id) subjects.set(n.id, toSubject(n));
		},
		errors
	);
	return { subjects, errors: [...new Set(errors)].slice(0, 3) };
}

/** Details of an item that did not change are read again after this long, as a safety net. */
export const DETAILS_TTL = 60 * 60_000;

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
		stored.ci === 'PENDING' ||
		stored.ci === 'EXPECTED' ||
		now - (readAt ?? 0) > DETAILS_TTL
	);
}

/** A team search keeps only the PRs that request one of its teams (see expandSections). */
export const forTeams = (q: ExpandedQuery, s: SubjectFacts, me: string) =>
	!q.teams ||
	s.reviewRequests.some((r) =>
		r.team
			? q.teams!.some((t) => t.toLowerCase() === r.name.toLowerCase())
			: !!q.orDirect && r.name.toLowerCase() === me.toLowerCase()
	);

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
      baseRefName headRefName headRefOid reviewDecision mergeable mergeStateStatus locked
      ${REACTION_FIELDS}
      viewerDidAuthor viewerCanClose viewerCanReopen viewerCanMergeAsAdmin
      viewerCanEnableAutoMerge viewerCanDisableAutoMerge autoMergeRequest { mergeMethod }
      repository { nameWithOwner viewerPermission mergeCommitAllowed squashMergeAllowed rebaseMergeAllowed }
      author { ${PERSON} }
      labels(first: 10) { nodes { name color } }
      assignees(first: 10) { nodes { login } }
      latestOpinionatedReviews(first: 20) { nodes { state author { ${PERSON} } } }
      reviewThreads(first: 50) { nodes { isResolved } }
      reviewRequests(first: 20) { nodes { requestedReviewer { __typename ... on User { login } ... on Team { name } } } }
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
          ... on IssueComment { author { ${PERSON} } bodyHTML createdAt url ${REACTION_FIELDS} }
          ... on PullRequestReview { author { ${PERSON} } bodyHTML state submittedAt createdAt url comments { totalCount } ${REACTION_FIELDS} }
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
        nodes { __typename ... on IssueComment { author { ${PERSON} } bodyHTML createdAt url ${REACTION_FIELDS} } }
      }
    }
  } }
}
${SUBJECT_FIELDS}`;

/** Permissions that may still write in a locked conversation, and merge. */
const WRITERS = new Set(['ADMIN', 'MAINTAIN', 'WRITE']);

const person = (a: Node | null | undefined): PeekPerson => ({
	login: a?.login ?? 'ghost',
	avatar: a?.avatarUrl ?? null,
	bot: a?.__typename === 'Bot' || isBot(a?.login)
});

function checkState(n: Node): CheckState {
	if (n.__typename === 'StatusContext') {
		const s = String(n.state);
		return s === 'SUCCESS'
			? 'success'
			: s === 'PENDING' || s === 'EXPECTED'
				? 'pending'
				: 'failure';
	}
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
): Promise<{ peek: PeekDTO; subject: SubjectFacts } | null> {
	const res = await gh(token, '/graphql', {
		method: 'POST',
		body: JSON.stringify({ query: PEEK_QUERY, variables: { me, o: owner, r: repo, n: number } })
	});
	if (!res.ok) throw new GitHubError(res.status, `GitHub returned ${res.status}.`);
	const json = (await res.json()) as { data?: Node; errors?: { message: string }[] };
	const n: Node | null | undefined = json.data?.repository?.issueOrPullRequest;
	if (!n) {
		if (json.errors?.length && json.data?.repository !== null)
			throw new GitHubError(502, json.errors[0].message);
		return null;
	}
	const pr = n.__typename === 'PullRequest';
	const subject = toSubject(n);
	const items: PeekEntry[] = (n.timelineItems?.nodes ?? [])
		.filter((t: Node) => t?.__typename)
		.map((t: Node) =>
			t.__typename === 'PullRequestReview'
				? {
						type: 'review',
						author: person(t.author),
						at: t.submittedAt ?? t.createdAt,
						url: t.url,
						html: t.bodyHTML ?? '',
						state: t.state,
						inline: t.comments?.totalCount ?? 0,
						reactions: reactionsOf(t)
					}
				: {
						type: 'comment',
						author: person(t.author),
						at: t.createdAt,
						url: t.url,
						html: t.bodyHTML ?? '',
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
			comment: !n.locked || WRITERS.has(n.repository?.viewerPermission),
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
		failedRuns
	};
	const peek: PeekDTO = {
		...base,
		pr: {
			base: n.baseRefName,
			head: n.headRefName,
			additions: n.additions ?? 0,
			deletions: n.deletions ?? 0,
			files: n.changedFiles ?? 0,
			openThreads: subject.openThreads,
			reviewDecision: n.reviewDecision ?? null,
			mergeable: n.mergeable ?? null,
			reviews: (n.latestOpinionatedReviews?.nodes ?? []).map((r: Node) => ({
				who: person(r.author),
				state: r.state
			})),
			requested: (n.reviewRequests?.nodes ?? [])
				.map((r: Node) => r.requestedReviewer)
				.filter(Boolean)
				.map((r: Node) => ({ name: r.login ?? r.name, team: r.__typename === 'Team' })),
			ci: (rollup?.state as CiState | undefined) ?? null,
			checks,
			checksTotal: rollup?.contexts?.totalCount ?? checks.length
		}
	};
	return { peek, subject };
}
