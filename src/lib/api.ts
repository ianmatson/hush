import { hc, type ClientResponse } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import type { AppType } from '../../.api-types/worker/index';
import type { SnoozeEvent } from '$lib/shared/snooze';
import type { MergeMethod, Rule, Settings } from '$lib/shared/types';
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

type ItemsBody = Success<Awaited<ReturnType<typeof client.api.items.$get>>>;
export type ItemsResponse = ItemsBody & {
	/** Send back as If-None-Match; the server answers 304 while nothing changes. */
	etag?: string;
};

/** The lists the app shows: a lane, or what you did with items (Search). */
export type ListView = 'turn' | 'waiting' | 'updates' | 'done' | 'snoozed' | 'muted' | 'all';
export type ItemAction = 'done' | 'restore' | 'snooze' | 'mute' | 'seen' | 'my-turn';
/** The body of an item action: snooze takes a time or a condition. */
export type ActionBody = { until?: number; event?: SnoozeEvent };
/** Why an item is not your turn. */
export type NotMineAnswer = 'once' | 'others-reviewed' | 'team' | 'bots' | 'repo';

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
	items: async (view: ListView, etag?: string): Promise<ItemsResponse | null> => {
		const res = await client.api.items.$get(
			{ query: { view } },
			{ headers: etag ? { 'If-None-Match': etag } : {} }
		);
		if (res.status === 304) return null;
		const data = await ok(Promise.resolve(res));
		return { ...data, etag: res.headers.get('ETag') ?? undefined };
	},
	item: (key: string) => ok(client.api.item.$get({ query: { key } })),
	summary: () => ok(client.api.items.summary.$get()),
	act: (keys: string[], action: ItemAction, body: ActionBody = {}) =>
		ok(client.api.items.action.$post({ json: { keys, action, ...body } })),
	notMine: (key: string, answer: NotMineAnswer) =>
		ok(client.api.items['not-mine'].$post({ json: { key, answer } })),
	finishedSeen: () => ok(client.api.items['finished-seen'].$post()),
	onboarded: () => ok(client.api.onboarded.$post()),
	sync: () => ok(client.api.sync.$post()),
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
	teams: (refresh = false) => ok(client.api.teams.$get({ query: refresh ? { refresh: '1' } : {} })),
	recheck: (repo: string, number: number) =>
		ok(client.api.recheck.$post({ json: { repo, number } })),
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
	/** Make the feed of a lane or saved search: 'turn', 'waiting', 'updates', or 's:<id>'. */
	feedOn: (view: string) => ok(client.api.feeds[':view'].$put({ param: { view } })),
	feedOff: (view: string) => ok(client.api.feeds[':view'].$delete({ param: { view } })),
	sessions: () => ok(client.api.account.sessions.$get()),
	endSession: (id: string) => ok(client.api.account.sessions[':id'].$delete({ param: { id } })),
	/** Sign out every other browser. */
	endOtherSessions: () => ok(client.api.account.sessions.$delete())
};
