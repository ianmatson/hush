import type { RunJobDTO, ThreadPeekDTO } from '../src/lib/shared/types';
import { gh, GitHubError } from './github';

/**
 * The peek of threads that are not PRs or issues: a workflow run (its jobs, the steps that
 * failed, and the end of their logs), a release, a commit, a discussion, or Dependabot alerts.
 * Each reads only what the peek shows; a kind with nothing to read gets a short note.
 */
export interface ThreadRef {
	repo: string;
	subjectType: string;
	title: string;
	htmlUrl: string;
	/** GitHub's API address of the subject (null for workflow runs and older threads). */
	apiUrl: string | null;
	updatedAt: string;
}

type Json = Record<string, unknown> & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function json(token: string, path: string, accept?: string): Promise<Json | null> {
	const res = await gh(token, path, accept ? { headers: { Accept: accept } } : {});
	if (res.status === 401) throw new GitHubError(401, 'GitHub rejected the token.');
	if (!res.ok) return null;
	return (await res.json()) as Json;
}

export async function fetchThreadPeek(token: string, t: ThreadRef): Promise<ThreadPeekDTO> {
	const base = { repo: t.repo, url: t.htmlUrl };
	switch (t.subjectType) {
		case 'CheckSuite':
		case 'WorkflowRun':
			return (
				(await runPeek(token, t)) ?? {
					...base,
					kind: 'none',
					note: 'Hush did not find this workflow run. It may be too old, or renamed.'
				}
			);
		case 'Release':
			return (
				(await releasePeek(token, t)) ?? {
					...base,
					kind: 'none',
					note: 'Hush did not find this release.'
				}
			);
		case 'Commit':
			return (
				(await commitPeek(token, t)) ?? {
					...base,
					kind: 'none',
					note: 'Hush did not find this commit.'
				}
			);
		case 'Discussion':
			return (
				(await discussionPeek(token, t)) ?? {
					...base,
					kind: 'none',
					note: 'Hush did not find this discussion.'
				}
			);
		case 'RepositoryVulnerabilityAlert':
		case 'RepositoryDependabotAlertsThread':
			return alertsPeek(token, t);
		case 'RepositoryInvitation':
			return { ...base, kind: 'none', note: 'Accept or decline the invitation on GitHub.' };
		default:
			return { ...base, kind: 'none', note: 'GitHub gives no more about this notification.' };
	}
}

// --- Workflow runs --------------------------------------------------------------------

/** "Deploy workflow run, Attempt #2 failed for main branch" → its parts. */
export function parseRunTitle(
	title: string
): { workflow: string; branch: string; result: string } | null {
	const m = /^(.+?) workflow run(?:, Attempt #\d+)? ([\w ]+?) for (.+) branch$/.exec(title.trim());
	return m ? { workflow: m[1], result: m[2], branch: m[3] } : null;
}

/** The run result that a notification's word means ("failed" → "failure"). */
const RESULT_WORD: Record<string, string> = {
	failed: 'failure',
	succeeded: 'success',
	cancelled: 'cancelled',
	'timed out': 'timed_out'
};

type Run = {
	id: number;
	name: string;
	display_title: string;
	run_number: number;
	run_attempt: number;
	event: string;
	status: string;
	conclusion: string | null;
	head_branch: string;
	head_sha: string;
	html_url: string;
	actor?: { login: string };
	run_started_at?: string;
	created_at: string;
	updated_at: string;
	pull_requests?: { number: number }[];
};

async function runPeek(token: string, t: ThreadRef): Promise<ThreadPeekDTO | null> {
	const parts = parseRunTitle(t.title);
	if (!parts) return null;
	const q = `branch=${encodeURIComponent(parts.branch)}&per_page=30`;
	const list = await json(token, `/repos/${t.repo}/actions/runs?${q}`);
	const runs = ((list?.workflow_runs ?? []) as Run[]).filter((r) => r.name === parts.workflow);
	if (!runs.length) return null;
	// The run that the notification was about: the newest one with its result that ended before it
	// (a later run may have passed since).
	const at = Date.parse(t.updatedAt) + 5 * 60_000;
	const before = runs.filter((r) => Date.parse(r.updated_at) <= at);
	const result = RESULT_WORD[parts.result];
	const run =
		before.find((r) => r.conclusion === result) ??
		runs.find((r) => r.conclusion === result) ??
		before[0] ??
		runs[runs.length - 1];
	const jobsRes = await json(token, `/repos/${t.repo}/actions/runs/${run.id}/jobs?per_page=50`);
	type Job = {
		id: number;
		name: string;
		status: string;
		conclusion: string | null;
		html_url: string;
		started_at: string | null;
		completed_at: string | null;
		steps?: { name: string; conclusion: string | null }[];
	};
	const jobs = ((jobsRes?.jobs ?? []) as Job[]).map((j): RunJobDTO => ({
		id: j.id,
		name: j.name,
		status: j.status,
		conclusion: j.conclusion,
		url: j.html_url,
		startedAt: j.started_at,
		completedAt: j.completed_at,
		failedSteps: (j.steps ?? []).filter((s) => s.conclusion === 'failure').map((s) => s.name),
		log: null
	}));
	// The end of the log of the first few failed jobs (up to their last error).
	const failed = jobs.filter((j) => j.conclusion === 'failure').slice(0, 3);
	await Promise.all(failed.map(async (j) => (j.log = await jobLogTail(token, t.repo, j.id))));
	return {
		repo: t.repo,
		url: run.html_url,
		kind: 'run',
		run: {
			id: run.id,
			name: run.name,
			title: run.display_title,
			number: run.run_number,
			attempt: run.run_attempt,
			event: run.event,
			status: run.status,
			conclusion: run.conclusion,
			branch: run.head_branch,
			sha: run.head_sha,
			actor: run.actor?.login ?? null,
			startedAt: run.run_started_at ?? run.created_at,
			updatedAt: run.updated_at,
			prs: (run.pull_requests ?? []).map((p) => p.number)
		},
		jobs
	};
}

const LOG_TAIL_BYTES = 64 * 1024;
const LOG_LINES = 40;

/**
 * The last lines of a job's log, up to and just after its last error. GitHub answers with a
 * redirect to the log file; only its last 64 KB is read.
 */
async function jobLogTail(token: string, repo: string, job: number): Promise<string[] | null> {
	const res = await gh(token, `/repos/${repo}/actions/jobs/${job}/logs`, { redirect: 'manual' });
	const at = res.headers.get('Location');
	if (!at) return null;
	const file = await fetch(at, { headers: { Range: `bytes=-${LOG_TAIL_BYTES}` } });
	if (!file.ok) return null;
	return logTail(await file.text());
}

/** Log text → its last lines up to the last error, without timestamps or group markers. */
export function logTail(text: string): string[] {
	const lines = text
		.split(/\r?\n/)
		.map((l) =>
			l
				.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z ?/, '')
				.replace(/^##\[(group|endgroup)\]/, '')
				// Terminal colors ("\x1b[36;1m").
				// eslint-disable-next-line no-control-regex
				.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
		)
		.map((l) => (l.length > 300 ? `${l.slice(0, 300)}…` : l));
	// The first line of a byte range is usually cut: drop it.
	if (lines.length > 1) lines.shift();
	let end = lines.length;
	for (let i = lines.length - 1; i >= 0; i--)
		if (lines[i].startsWith('##[error]')) {
			end = Math.min(lines.length, i + 3);
			break;
		}
	while (end > 0 && !lines[end - 1].trim()) end--;
	return lines.slice(Math.max(0, end - LOG_LINES), end);
}

// --- Releases, commits, discussions, alerts -------------------------------------------

async function releasePeek(token: string, t: ThreadRef): Promise<ThreadPeekDTO | null> {
	const html = 'application/vnd.github.html+json';
	let r = t.apiUrl?.includes('/releases/') ? await json(token, t.apiUrl, html) : null;
	if (!r) {
		const list = ((await json(token, `/repos/${t.repo}/releases?per_page=20`, html)) ??
			[]) as unknown as Json[];
		r = list.find((x) => x.name === t.title || x.tag_name === t.title) ?? list[0] ?? null;
	}
	if (!r) return null;
	return {
		repo: t.repo,
		url: r.html_url,
		kind: 'release',
		name: r.name || r.tag_name,
		tag: r.tag_name,
		author: r.author?.login ?? null,
		publishedAt: r.published_at ?? null,
		prerelease: !!r.prerelease,
		html: String(r.body_html ?? '').slice(0, 50_000),
		assets: (r.assets ?? []).length
	};
}

async function commitPeek(token: string, t: ThreadRef): Promise<ThreadPeekDTO | null> {
	const c = t.apiUrl ? await json(token, t.apiUrl) : null;
	if (!c) return null;
	const files = (c.files ?? []) as {
		filename: string;
		status: string;
		additions: number;
		deletions: number;
	}[];
	return {
		repo: t.repo,
		url: c.html_url,
		kind: 'commit',
		sha: c.sha,
		message: String(c.commit?.message ?? ''),
		author: c.author?.login ?? c.commit?.author?.name ?? null,
		date: c.commit?.author?.date ?? null,
		additions: c.stats?.additions ?? 0,
		deletions: c.stats?.deletions ?? 0,
		files: files.slice(0, 30).map((f) => ({
			name: f.filename,
			status: f.status,
			additions: f.additions,
			deletions: f.deletions
		})),
		totalFiles: files.length
	};
}

const DISCUSSION = `
  number title url bodyHTML createdAt isAnswered
  author { login } category { name }
  comments(last: 10) { totalCount nodes { author { login } bodyHTML createdAt url } }`;

async function discussionPeek(token: string, t: ThreadRef): Promise<ThreadPeekDTO | null> {
	const [owner, name] = t.repo.split('/');
	const graphql = async (query: string, variables: Record<string, unknown>) => {
		const res = await gh(token, '/graphql', {
			method: 'POST',
			body: JSON.stringify({ query, variables })
		});
		return res.ok ? ((await res.json()) as Json).data : null;
	};
	let number = Number(/\/discussions\/(\d+)/.exec(t.apiUrl ?? '')?.[1]);
	let d: Json | null = null;
	if (number) {
		const data = await graphql(
			`query($o: String!, $r: String!, $n: Int!) { repository(owner: $o, name: $r) { discussion(number: $n) { ${DISCUSSION} } } }`,
			{ o: owner, r: name, n: number }
		);
		d = data?.repository?.discussion ?? null;
	} else {
		const data = await graphql(
			`query($q: String!) { search(query: $q, type: DISCUSSION, first: 1) { nodes { ... on Discussion { ${DISCUSSION} } } } }`,
			{ q: `repo:${t.repo} in:title "${t.title.replace(/"/g, '')}"` }
		);
		d = data?.search?.nodes?.[0] ?? null;
		number = d?.number ?? 0;
	}
	if (!d) return null;
	return {
		repo: t.repo,
		url: d.url,
		kind: 'discussion',
		number,
		title: d.title,
		author: d.author?.login ?? null,
		createdAt: d.createdAt,
		category: d.category?.name ?? null,
		answered: !!d.isAnswered,
		html: d.bodyHTML ?? '',
		comments: (d.comments?.nodes ?? []).map((c: Json) => ({
			author: c.author?.login ?? null,
			html: c.bodyHTML ?? '',
			createdAt: c.createdAt,
			url: c.url
		})),
		totalComments: d.comments?.totalCount ?? 0
	};
}

async function alertsPeek(token: string, t: ThreadRef): Promise<ThreadPeekDTO> {
	const res = await gh(
		token,
		`/repos/${t.repo}/dependabot/alerts?state=open&per_page=10&sort=created&direction=desc`
	);
	if (res.status === 401) throw new GitHubError(401, 'GitHub rejected the token.');
	const base = { repo: t.repo, url: `https://github.com/${t.repo}/security/dependabot` };
	if (!res.ok)
		return {
			...base,
			kind: 'alerts',
			alerts: [],
			error:
				res.status === 403 || res.status === 404
					? 'GitHub does not show this repository’s Dependabot alerts to Hush. Open them on GitHub.'
					: `GitHub returned ${res.status}.`
		};
	const list = (await res.json()) as Json[];
	return {
		...base,
		kind: 'alerts',
		error: null,
		alerts: list.map((a) => ({
			number: a.number,
			severity: a.security_advisory?.severity ?? a.security_vulnerability?.severity ?? 'unknown',
			summary: a.security_advisory?.summary ?? '',
			package: a.security_vulnerability?.package?.name ?? a.dependency?.package?.name ?? '',
			ecosystem: a.security_vulnerability?.package?.ecosystem ?? '',
			patched: a.security_vulnerability?.first_patched_version?.identifier ?? null,
			manifest: a.dependency?.manifest_path ?? null,
			url: a.html_url,
			createdAt: a.created_at
		}))
	};
}
