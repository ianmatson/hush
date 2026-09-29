import { hc, type ClientResponse } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import type { AppType } from '../../.api-types/worker/index';
import type { SnoozeEvent } from '$lib/shared/snooze';
import type { DashKind, MergeMethod, Rule, Settings, Turn, View } from '$lib/shared/types';
import type { GhActionId } from '$lib/shared/actions';

export class ApiError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

// The typed client: paths, inputs, and outputs come from the Worker's routes (worker/index.ts →
// AppType, emitted as declarations by `pnpm types:api`). A route that changes shape is a type error
// here and in the pages that use it.
const client = hc<AppType>('/');

/** The body of a successful (2xx) answer. */
type Success<R> =
	R extends ClientResponse<infer T, infer S, infer _F>
		? S extends SuccessStatusCode
			? T
			: never
		: never;

/** Await a request: the success body, or an ApiError with the server's message. */
async function ok<R extends ClientResponse<unknown, number, string>>(
	request: Promise<R>
): Promise<Success<R>> {
	const res = await request;
	const data = await res.json().catch(() => ({}));
	if (!res.ok)
		throw new ApiError(
			res.status,
			(data as { error?: string }).error ?? `Request failed (${res.status})`
		);
	return data as Success<R>;
}

type ThreadsBody = Success<Awaited<ReturnType<typeof client.api.threads.$get>>>;
export type ThreadsResponse = ThreadsBody & {
	/** Send back as If-None-Match; the server answers 304 while nothing changes. */
	etag?: string;
};

/** Why a thread does not need you (worker/poller/data.ts: notNeeded). */
export type NotNeededAnswer = 'others-reviewed' | 'team' | 'bots' | 'repo' | 'once';
export type ThreadAction =
	'done' | 'undone' | 'read' | 'unread' | 'snooze' | 'unsnooze' | 'mute' | 'unmute';
/** The body of a thread action: snooze takes a time or a condition. */
export type ActionBody = { until?: number; event?: SnoozeEvent };

export const api = {
	me: () => ok(client.api.me.$get()),
	/** An action on GitHub (approve, comment, merge…); the server reads the PR or issue again. */
	ghAction: (a: {
		repo: string;
		number: number;
		action: GhActionId;
		body?: string;
		method?: MergeMethod;
		sha?: string;
		runs?: number[];
		id?: string;
	}) => ok(client.api.actions.$post({ json: a })),
	/** Use your own GitHub token in place of the one from Sign in with GitHub. */
	setToken: (token: string) => ok(client.api.account.token.$put({ json: { token } })),
	/** The orgs your GitHub sign-in can see (GitHub omits orgs that have not approved Hush). */
	orgs: () => ok(client.api.account.orgs.$get()),
	logout: () => ok(client.api.auth.logout.$post()),
	deleteAccount: () => ok(client.api.account.$delete()),
	/** Returns null when the server says nothing changed since `etag` (304). */
	threads: async (view: View, etag?: string): Promise<ThreadsResponse | null> => {
		const res = await client.api.threads.$get(
			{ query: { view } },
			{ headers: etag ? { 'If-None-Match': etag } : {} }
		);
		if (res.status === 304) return null;
		const data = await ok(Promise.resolve(res));
		return { ...data, etag: res.headers.get('ETag') ?? undefined };
	},
	actMany: (ids: string[], action: ThreadAction, body?: ActionBody) =>
		ok(
			client.api.threads.bulk[':action'].$post({
				param: { action },
				query: { ids: ids.join(',') },
				json: body ?? {}
			})
		),
	act: (id: string, action: ThreadAction, body?: ActionBody) =>
		ok(client.api.threads[':id'][':action'].$post({ param: { id, action }, json: body ?? {} })),
	sync: () => ok(client.api.sync.$post()),
	/** What Hush found (the first-run card). */
	summary: () => ok(client.api.threads.summary.$get()),
	onboarded: () => ok(client.api.onboarded.$post()),
	/** You looked at these PRs or issues ("owner/repo#123"). */
	seen: (keys: string[]) => ok(client.api.seen.$post({ json: { keys } })),
	/** "Doesn't need me": a thread id or a dashboard item ("owner/repo#123"), and why. */
	notNeeded: (id: string, answer: NotNeededAnswer) =>
		ok(client.api['not-needed'].$post({ json: { id, answer } })),
	undoOnlyThisOne: (id: string) => ok(client.api['not-needed'].undo.$post({ json: { id } })),
	previewRules: (rules: Rule[]) => ok(client.api.rules.preview.$post({ json: { rules } })),
	saveSettings: (s: Partial<Settings>) => ok(client.api.settings.$put({ json: s })),
	/** Replace all your changes (settings.json, import): the rest goes back to defaults. */
	replaceSettings: (s: Partial<Settings>) => ok(client.api.settings.all.$put({ json: s })),
	vapidKey: () => ok(client.api.push['vapid-key'].$get()),
	subscriptions: () => ok(client.api.push.subscriptions.$get()),
	subscribe: (sub: PushSubscriptionJSON, label: string) =>
		ok(
			client.api.push.subscribe.$post({
				json: { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string }, label }
			})
		),
	unsubscribe: (endpoint: string) => ok(client.api.push.unsubscribe.$post({ json: { endpoint } })),
	testPush: () => ok(client.api.push.test.$post()),
	dashboard: (kind: DashKind, refresh = false) =>
		ok(
			client.api.dashboard[':kind'].$get({
				param: { kind },
				query: refresh ? { refresh: '1' } : {}
			})
		),
	hide: (items: { id: string; updatedAt: string }[]) =>
		ok(client.api.dashboard.hide.$post({ json: { items } })),
	unhide: (ids: string[]) => ok(client.api.dashboard.unhide.$post({ json: { ids } })),
	/** Hidden until you unmute it; its threads are muted too (also on GitHub). */
	muteItems: (ids: string[]) => ok(client.api.dashboard.mute.$post({ json: { ids } })),
	arrange: (items: { id: string; updatedAt: string; turn?: Turn | null }[], order: string[]) =>
		ok(client.api.dashboard.arrange.$post({ json: { items, order } })),
	teams: (refresh = false) => ok(client.api.teams.$get({ query: refresh ? { refresh: '1' } : {} })),
	recheck: (repo: string, number: number) =>
		ok(client.api.recheck.$post({ json: { repo, number } })),
	/** The peek of a thread that is not a PR or issue (a workflow run, a release…). */
	peekThread: (id: string) => ok(client.api['peek-thread'][':id'].$get({ param: { id } })),
	/** Re-run the failed jobs of a workflow run (from its peek). */
	rerunRun: (repo: string, run: number) =>
		ok(client.api.actions.$post({ json: { repo, action: 'rerun', runs: [run] } })),
	peek: (repo: string, number: number) => {
		const [owner, name] = repo.split('/');
		return ok(
			client.api.peek[':owner'][':repo'][':number'].$get({
				param: { owner, repo: name, number: String(number) }
			})
		);
	},
	alerts: () => ok(client.api.alerts.$get()),
	feeds: () => ok(client.api.feeds.$get()),
	/** Turn on the feed of a tab: 'action', 'fyi', 'inbox', or 'v:<saved view id>'. */
	feedOn: (view: string) => ok(client.api.feeds[':view'].$put({ param: { view } })),
	feedOff: (view: string) => ok(client.api.feeds[':view'].$delete({ param: { view } })),
	sessions: () => ok(client.api.account.sessions.$get()),
	endSession: (id: string) => ok(client.api.account.sessions[':id'].$delete({ param: { id } })),
	/** Sign out every other browser. */
	endOtherSessions: () => ok(client.api.account.sessions.$delete())
};
