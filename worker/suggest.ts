import type { RefSuggestion, UserSuggestion } from '../src/lib/shared/suggest';
import { gh, GitHubError } from './github';

// --- Suggestions for the comment box ("@" and "#"), from GitHub's public API ----------------
// GitHub.com's own box uses private endpoints; these give the same people and items: the repo's
// mentionable users (collaborators and people who took part), the org's teams, and the repo's
// issues and PRs, the most recently updated first. The conversation's people come from the peek.

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

async function graphql(token: string, query: string, variables: Record<string, unknown>) {
	const res = await gh(token, '/graphql', {
		method: 'POST',
		body: JSON.stringify({ query, variables })
	});
	if (!res.ok) throw new GitHubError(res.status, `GitHub returned ${res.status}.`);
	const j = (await res.json()) as { data?: Json; errors?: { message: string }[] };
	if (!j.data && j.errors?.length) throw new GitHubError(502, j.errors[0].message);
	return j.data;
}

const USERS = `query($o: String!, $r: String!, $q: String, $t: String) {
  repository(owner: $o, name: $r) {
    mentionableUsers(first: 20, query: $q) { nodes { login name avatarUrl(size: 40) } }
    owner { __typename login ... on Organization {
      teams(first: 8, query: $t, orderBy: { field: NAME, direction: ASC }) { nodes { slug name } }
    } }
  }
}`;

export async function suggestUsers(
	token: string,
	owner: string,
	repo: string,
	query: string
): Promise<UserSuggestion[]> {
	// "org/te" asks only for teams; "al" asks for both.
	const [first, team] = query.includes('/') ? query.split('/', 2) : [query, null];
	const data = await graphql(token, USERS, {
		o: owner,
		r: repo,
		q: team === null ? first : '',
		t: team ?? first
	});
	const r = data?.repository;
	if (!r) return [];
	const org = r.owner?.__typename === 'Organization' ? (r.owner.login as string) : null;
	const users: UserSuggestion[] =
		team === null
			? (r.mentionableUsers?.nodes ?? []).map((u: Json) => ({
					kind: 'user',
					login: u.login,
					name: u.name || null,
					avatar: u.avatarUrl ?? null,
					team: false
				}))
			: [];
	const teams: UserSuggestion[] =
		org && (team === null || first.toLowerCase() === org.toLowerCase())
			? (r.owner.teams?.nodes ?? []).map((t: Json) => ({
					kind: 'user',
					login: `${org}/${t.slug}`,
					name: t.name || null,
					avatar: null,
					team: true
				}))
			: [];
	return [...users, ...teams];
}

const ITEM = `__typename
  ... on Issue { number title state }
  ... on PullRequest { number title state isDraft merged }`;

const REFS = `query($o: String!, $r: String!, $s: String!, $n: Int!, $byNumber: Boolean!) {
  repository(owner: $o, name: $r) {
    issueOrPullRequest(number: $n) @include(if: $byNumber) { ${ITEM} }
  }
  search(query: $s, type: ISSUE, first: 10) { nodes { ${ITEM} } }
}`;

const toRef = (n: Json, repo: string | null): RefSuggestion | null =>
	n?.number
		? {
				kind: 'ref',
				number: n.number,
				title: n.title,
				type: n.__typename === 'PullRequest' ? 'pr' : 'issue',
				state: n.merged ? 'merged' : n.state !== 'OPEN' ? 'closed' : n.isDraft ? 'draft' : 'open',
				repo
			}
		: null;

export async function suggestRefs(
	token: string,
	owner: string,
	repo: string,
	query: string,
	/** Set when the reference is to another repo than the comment's. */
	other: boolean
): Promise<RefSuggestion[]> {
	const n = /^\d{1,9}$/.test(query) ? Number(query) : 0;
	const words = query.replace(/["\\]/g, '').trim();
	const s = `repo:${owner}/${repo} ${n ? '' : words ? `${words} in:title ` : ''}sort:updated-desc`;
	const data = await graphql(token, REFS, { o: owner, r: repo, s, n, byNumber: n > 0 });
	const name = other ? `${owner}/${repo}` : null;
	return [data?.repository?.issueOrPullRequest, ...(data?.search?.nodes ?? [])].flatMap(
		(x: Json) => toRef(x, name) ?? []
	);
}
