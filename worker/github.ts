import type {
	CheckState,
	CiState,
	Enrichment,
	PeekDTO,
	PeekEntry,
	PeekPerson,
	TeamDTO
} from '../src/lib/shared/types';
import { isBot } from '../src/lib/shared/classify';
import type { DashFacts, ExpandedQuery } from '../src/lib/shared/dashboard';

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

export function gh(token: string, path: string, init: RequestInit = {}): Promise<Response> {
	const headers = new Headers(init.headers);
	headers.set('Authorization', `Bearer ${token}`);
	headers.set('Accept', 'application/vnd.github+json');
	headers.set('X-GitHub-Api-Version', '2022-11-28');
	headers.set('User-Agent', UA);
	return fetch(path.startsWith('http') ? path : `${API}${path}`, { ...init, headers });
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

/** "HogFM workflow run failed for master branch" → workflow name and branch. */
export function parseWorkflowTitle(title: string): { workflow: string; branch: string } | null {
	const m = title.match(/^(.+?) workflow run .+? for (.+) branch$/i);
	return m ? { workflow: m[1], branch: m[2] } : null;
}

/**
 * Did a run of this workflow on this branch pass after `since`? The newest completed run decides.
 * null when GitHub cannot tell (unknown workflow, no access). One or two REST requests; pass a
 * shared `workflows` map to reuse the workflow list of a repo.
 */
export async function laterRunPassed(
	token: string,
	repo: string,
	workflow: string,
	branch: string,
	since: string,
	workflows: Map<string, Promise<{ id: number; name: string }[]>>
): Promise<boolean | null> {
	let list = workflows.get(repo);
	if (!list) {
		list = gh(token, `/repos/${repo}/actions/workflows?per_page=100`).then(async (r) =>
			r.ok ? ((await r.json()) as { workflows: { id: number; name: string }[] }).workflows : []
		);
		workflows.set(repo, list);
	}
	const wf = (await list).find((w) => w.name === workflow);
	if (!wf) return null;
	const res = await gh(
		token,
		`/repos/${repo}/actions/workflows/${wf.id}/runs?branch=${encodeURIComponent(branch)}&status=completed&per_page=1`
	);
	if (!res.ok) return null;
	const run = (
		(await res.json()) as { workflow_runs: { conclusion: string; created_at: string }[] }
	).workflow_runs[0];
	if (!run) return null;
	return run.conclusion === 'success' && Date.parse(run.created_at) > Date.parse(since);
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
// GraphQL enrichment: one request for up to CHUNK subjects, with aliases.

const CHUNK = 40;

const FIELDS = `
__typename
... on PullRequest {
  number url state isDraft merged additions deletions reviewDecision mergeable
  author { login __typename }
  labels(first: 10) { nodes { name } }
  assignees(first: 10) { nodes { login } }
  reviewRequests(first: 20) { nodes { requestedReviewer { __typename ... on User { login } ... on Team { slug } } } }
  commits(last: 1) { nodes { commit { committedDate statusCheckRollup { state } } } }
  comments(last: 1) { nodes { author { login __typename } bodyText url createdAt } }
  reviews(last: 1) { nodes { author { login } submittedAt state } }
  myReviews: reviews(author: $me, last: 1) { nodes { submittedAt state } }
}
... on Issue {
  number url state
  author { login __typename }
  labels(first: 10) { nodes { name } }
  assignees(first: 10) { nodes { login } }
  comments(last: 1) { nodes { author { login __typename } bodyText url createdAt } }
}`;

export interface SubjectRef {
	key: string;
	owner: string;
	repo: string;
	number: number;
}

type Node = Record<string, any>;

function toEnrichment(n: Node, me: string): Enrichment {
	const meL = me.toLowerCase();
	const authorLogin: string | undefined = n.author?.login;
	const comment = n.comments?.nodes?.[0];
	const base: Enrichment = {
		kind: n.__typename === 'PullRequest' ? 'pr' : 'issue',
		number: n.number,
		url: n.url,
		author: authorLogin,
		authorIsBot: n.author?.__typename === 'Bot' || isBot(authorLogin),
		labels: (n.labels?.nodes ?? []).map((l: Node) => l.name),
		assignedToMe: (n.assignees?.nodes ?? []).some((a: Node) => a.login?.toLowerCase() === meL),
		lastComment: comment
			? {
					author: comment.author?.login ?? 'ghost',
					authorIsBot: comment.author?.__typename === 'Bot' || isBot(comment.author?.login),
					body: String(comment.bodyText ?? '').slice(0, 280),
					url: comment.url,
					createdAt: comment.createdAt
				}
			: null
	};
	if (base.kind === 'issue') return { ...base, state: n.state === 'CLOSED' ? 'closed' : 'open' };

	const reviewers: Node[] = (n.reviewRequests?.nodes ?? []).map(
		(r: Node) => r.requestedReviewer ?? {}
	);
	return {
		...base,
		state: n.merged ? 'merged' : n.state === 'CLOSED' ? 'closed' : 'open',
		draft: !!n.isDraft,
		reviewDecision: n.reviewDecision ?? null,
		mergeable: n.mergeable,
		ci: (n.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state as CiState | undefined) ?? null,
		lastCommitAt: n.commits?.nodes?.[0]?.commit?.committedDate ?? null,
		myReview: n.myReviews?.nodes?.[0]?.submittedAt
			? { at: n.myReviews.nodes[0].submittedAt, state: n.myReviews.nodes[0].state }
			: null,
		latestReview: n.reviews?.nodes?.[0]
			? {
					author: n.reviews.nodes[0].author?.login ?? 'ghost',
					at: n.reviews.nodes[0].submittedAt,
					state: n.reviews.nodes[0].state
				}
			: null,
		reviewRequestedFromMe: reviewers.some(
			(r) => r.__typename === 'User' && r.login?.toLowerCase() === meL
		),
		requestedTeams: reviewers.filter((r) => r.__typename === 'Team').map((r) => r.slug),
		additions: n.additions,
		deletions: n.deletions
	};
}

/** Enrich PR/issue subjects. Subjects that fail (no access, SAML, deleted) are left out. */
export async function enrichSubjects(
	token: string,
	refs: SubjectRef[],
	me: string
): Promise<Map<string, Enrichment>> {
	const out = new Map<string, Enrichment>();
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
				`t${j}: repository(owner: $o${j}, name: $r${j}) { issueOrPullRequest(number: $n${j}) { ${FIELDS} } }`
			);
		});
		const query = `query(${decl.join(', ')}) {\n${body.join('\n')}\n}`;
		const res = await gh(token, '/graphql', {
			method: 'POST',
			body: JSON.stringify({ query, variables: vars })
		});
		if (!res.ok) continue;
		const json = (await res.json()) as { data?: Record<string, Node | null> };
		chunk.forEach((r, j) => {
			const node = json.data?.[`t${j}`]?.issueOrPullRequest;
			if (node) out.set(r.key, toEnrichment(node, me));
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

const SEARCH_FIELDS = `
fragment P on PullRequest {
  id number title url isDraft state merged createdAt updatedAt additions deletions reviewDecision mergeable
  repository { nameWithOwner }
  author { login avatarUrl(size: 48) __typename }
  labels(first: 6) { nodes { name color } }
  assignees(first: 5) { nodes { login } }
  comments(last: 1) { totalCount nodes { author { login __typename } createdAt } }
  commits(last: 1) { nodes { commit { committedDate statusCheckRollup { state } } } }
  reviewRequests(first: 20) { nodes { requestedReviewer { __typename ... on User { login } ... on Team { combinedSlug } } } }
  myReviews: reviews(author: $me, last: 1) { nodes { submittedAt state } }
  timelineItems(itemTypes: [REVIEW_REQUESTED_EVENT], last: 3) {
    nodes { ... on ReviewRequestedEvent { createdAt requestedReviewer { __typename ... on User { login } ... on Team { combinedSlug } } } }
  }
}
fragment I on Issue {
  id number title url state createdAt updatedAt
  repository { nameWithOwner }
  author { login avatarUrl(size: 48) __typename }
  labels(first: 6) { nodes { name color } }
  assignees(first: 5) { nodes { login } }
  comments(last: 1) { totalCount nodes { author { login __typename } createdAt } }
}`;

const SEARCH_CHUNK = 10;

function toFacts(n: Node, me: string, myTeams: Set<string>): DashFacts {
	const meL = me.toLowerCase();
	const pr = n.__typename === 'PullRequest';
	const c = n.comments?.nodes?.[0];
	const commit = n.commits?.nodes?.[0]?.commit;
	const reviewers: Node[] = (n.reviewRequests?.nodes ?? []).map(
		(r: Node) => r.requestedReviewer ?? {}
	);
	const isMe = (r: Node) => r?.__typename === 'User' && r.login?.toLowerCase() === meL;
	const requestedTeams = reviewers
		.filter((r) => r.__typename === 'Team' && myTeams.has(r.combinedSlug))
		.map((r) => r.combinedSlug as string);
	const requestedMe = reviewers.some(isMe);
	// Newest review-request event that targets you (or one of your teams).
	const events: Node[] = n.timelineItems?.nodes ?? [];
	const ev = [...events]
		.reverse()
		.find(
			(e) =>
				isMe(e.requestedReviewer) ||
				(e.requestedReviewer?.__typename === 'Team' &&
					myTeams.has(e.requestedReviewer.combinedSlug))
		);
	const review = n.myReviews?.nodes?.[0];
	return {
		id: n.id,
		kind: pr ? 'pr' : 'issue',
		number: n.number,
		title: n.title,
		url: n.url,
		repo: n.repository?.nameWithOwner ?? '',
		author: n.author?.login ?? 'ghost',
		authorAvatar: n.author?.avatarUrl ?? null,
		authorIsBot: n.author?.__typename === 'Bot' || isBot(n.author?.login),
		createdAt: n.createdAt,
		updatedAt: n.updatedAt,
		state: n.merged ? 'merged' : n.state === 'CLOSED' ? 'closed' : 'open',
		draft: !!n.isDraft,
		labels: (n.labels?.nodes ?? []).map((l: Node) => ({ name: l.name, color: l.color })),
		comments: n.comments?.totalCount ?? 0,
		lastCommentBy: c?.author?.login ?? null,
		lastCommentAt: c?.createdAt ?? null,
		lastCommentIsBot: c?.author?.__typename === 'Bot' || isBot(c?.author?.login),
		assignees: (n.assignees?.nodes ?? []).map((a: Node) => a.login),
		ci: pr ? ((commit?.statusCheckRollup?.state as CiState | undefined) ?? null) : null,
		reviewDecision: pr ? (n.reviewDecision ?? null) : null,
		mergeable: pr ? (n.mergeable ?? null) : null,
		additions: n.additions ?? 0,
		deletions: n.deletions ?? 0,
		requestedMe,
		requestedTeams,
		requestedAt: requestedMe || requestedTeams.length ? (ev?.createdAt ?? null) : null,
		myLastReviewAt: review?.submittedAt ?? null,
		myLastReviewState: review?.state ?? null,
		lastCommitAt: commit?.committedDate ?? null
	};
}

/** One PR or issue as a dashboard item (for a quick check after you acted on it). About 1 point. */
export async function fetchSubjectFacts(
	token: string,
	me: string,
	myTeams: Set<string>,
	owner: string,
	repo: string,
	number: number
): Promise<DashFacts | null> {
	const query = `query($me: String!, $o: String!, $r: String!, $n: Int!) {
  repository(owner: $o, name: $r) { issueOrPullRequest(number: $n) { __typename ...P ...I } }
}
${SEARCH_FIELDS}`;
	const res = await gh(token, '/graphql', {
		method: 'POST',
		body: JSON.stringify({ query, variables: { me, o: owner, r: repo, n: number } })
	});
	if (!res.ok) return null;
	const json = (await res.json()) as { data?: Node };
	const n = json.data?.repository?.issueOrPullRequest;
	return n?.id ? toFacts(n, me, myTeams) : null;
}

export interface SearchHit {
	section: string;
	facts: DashFacts;
}

/** Run many searches in few GraphQL requests. */
export async function searchDashboard(
	token: string,
	me: string,
	myTeams: Set<string>,
	queries: ExpandedQuery[]
): Promise<{ hits: SearchHit[]; errors: string[] }> {
	const hits: SearchHit[] = [];
	const errors: string[] = [];
	const chunks: ExpandedQuery[][] = [];
	for (let i = 0; i < queries.length; i += SEARCH_CHUNK)
		chunks.push(queries.slice(i, i + SEARCH_CHUNK));
	await Promise.all(
		chunks.map(async (chunk) => {
			const vars: Record<string, string> = { me };
			const decl = ['$me: String!'];
			const body = chunk.map((q, j) => {
				vars[`q${j}`] = q.q;
				decl.push(`$q${j}: String!`);
				return `s${j}: search(type: ISSUE, query: $q${j}, first: 25) { nodes { __typename ...P ...I } }`;
			});
			const query = `query(${decl.join(', ')}) {\n${body.join('\n')}\n}\n${SEARCH_FIELDS}`;
			const res = await gh(token, '/graphql', {
				method: 'POST',
				body: JSON.stringify({ query, variables: vars })
			});
			if (!res.ok) {
				errors.push(`GitHub search returned ${res.status}.`);
				return;
			}
			const json = (await res.json()) as {
				data?: Record<string, Node | null>;
				errors?: { message: string }[];
			};
			for (const e of json.errors ?? []) errors.push(e.message);
			chunk.forEach((q, j) => {
				for (const n of json.data?.[`s${j}`]?.nodes ?? []) {
					if (n?.id) hits.push({ section: q.section, facts: toFacts(n, me, myTeams) });
				}
			});
		})
	);
	return { hits, errors: [...new Set(errors)].slice(0, 3) };
}

// ---------------------------------------------------------------------------
// Peek: one PR or issue with its description, checks, and latest comments. About 1 point.

const PEEK_TIMELINE = 10;

const PERSON = `login avatarUrl(size: 48) __typename`;

const PEEK_QUERY = `query($o: String!, $r: String!, $n: Int!) {
  repository(owner: $o, name: $r) { issueOrPullRequest(number: $n) {
    __typename
    ... on PullRequest {
      number title url state isDraft merged createdAt bodyHTML additions deletions changedFiles
      baseRefName headRefName reviewDecision mergeable
      repository { nameWithOwner }
      author { ${PERSON} }
      labels(first: 10) { nodes { name color } }
      assignees(first: 10) { nodes { login } }
      latestOpinionatedReviews(first: 20) { nodes { state author { ${PERSON} } } }
      reviewRequests(first: 20) { nodes { requestedReviewer { __typename ... on User { login } ... on Team { name } } } }
      commits(last: 1) { nodes { commit { statusCheckRollup { state contexts(first: 100) {
        totalCount
        nodes {
          __typename
          ... on CheckRun { name status conclusion detailsUrl }
          ... on StatusContext { context state targetUrl }
        }
      } } } } }
      timelineItems(last: ${PEEK_TIMELINE}, itemTypes: [ISSUE_COMMENT, PULL_REQUEST_REVIEW]) {
        totalCount
        nodes {
          __typename
          ... on IssueComment { author { ${PERSON} } bodyHTML createdAt url }
          ... on PullRequestReview { author { ${PERSON} } bodyHTML state submittedAt createdAt url comments { totalCount } }
        }
      }
    }
    ... on Issue {
      number title url state createdAt bodyHTML
      repository { nameWithOwner }
      author { ${PERSON} }
      labels(first: 10) { nodes { name color } }
      assignees(first: 10) { nodes { login } }
      timelineItems(last: ${PEEK_TIMELINE}, itemTypes: [ISSUE_COMMENT]) {
        totalCount
        nodes { __typename ... on IssueComment { author { ${PERSON} } bodyHTML createdAt url } }
      }
    }
  } }
}`;

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

/** Fetch one PR or issue for the peek panel. Returns null when it does not exist or is hidden. */
export async function fetchPeek(
	token: string,
	owner: string,
	repo: string,
	number: number
): Promise<PeekDTO | null> {
	const res = await gh(token, '/graphql', {
		method: 'POST',
		body: JSON.stringify({ query: PEEK_QUERY, variables: { o: owner, r: repo, n: number } })
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
						inline: t.comments?.totalCount ?? 0
					}
				: {
						type: 'comment',
						author: person(t.author),
						at: t.createdAt,
						url: t.url,
						html: t.bodyHTML ?? ''
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
		labels: (n.labels?.nodes ?? []).map((l: Node) => ({ name: l.name, color: l.color })),
		assignees: (n.assignees?.nodes ?? []).map((a: Node) => a.login),
		timeline: { total: n.timelineItems?.totalCount ?? items.length, items }
	};
	if (!pr) return base;

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
	return {
		...base,
		pr: {
			base: n.baseRefName,
			head: n.headRefName,
			additions: n.additions ?? 0,
			deletions: n.deletions ?? 0,
			files: n.changedFiles ?? 0,
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
}
