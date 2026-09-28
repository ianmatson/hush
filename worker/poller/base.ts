import { DurableObject } from 'cloudflare:workers';
import type { LiveMessage, Settings, TeamDTO } from '../../src/lib/shared/types';
import { settingsOverrides, validateSettings } from '../../src/lib/shared/settings-schema';
import { DEFAULT_SETTINGS } from '../../src/lib/shared/settings';
import { getUser, parseSettings, userToken, type Env, type UserRow } from '../db';
import { fetchTeams } from '../github';
import { ITEMS, MIGRATIONS, SCHEMA_VERSION, settingsFromV1, type ItemWithFacts } from './schema';
import { TEAMS_TTL, type Who } from './shared';

/** A value SQLite can bind: strings, numbers, null (no booleans, no undefined). */
export type SqlValue = string | number | null;

/**
 * One Durable Object per user. This base has the user's own SQLite database (schema.ts), their
 * settings, and who they are; the layers above add alerts, items and the subject store, the
 * notification sync, the tracked searches, and the API's data methods.
 */
export abstract class PollerBase extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		// The tables exist before any request or alarm runs.
		void ctx.blockConcurrencyWhile(() => this.migrate());
		// Keep-alive pings get their answer without waking this object (see the live socket).
		ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
	}

	// --- The live socket ------------------------------------------------------------------

	/**
	 * /api/live: one WebSocket per open tab. Hibernatable, so an idle socket costs nothing: the
	 * object sleeps until it has something to say (broadcast) or an alarm runs.
	 */
	async fetch(request: Request): Promise<Response> {
		if (request.headers.get('Upgrade') !== 'websocket')
			return new Response('Expected a WebSocket', { status: 426 });
		const [client, server] = Object.values(new WebSocketPair());
		this.ctx.acceptWebSocket(server);
		return new Response(null, { status: 101, webSocket: client });
	}

	/** Tabs send only "ping", which the auto-response answers; anything else is ignored. */
	async webSocketMessage(): Promise<void> {}

	async webSocketClose(ws: WebSocket, code: number): Promise<void> {
		// Echo the tab's close. Codes such as 1005 (no code) and 1006 (connection lost) are only
		// reported, never sent: answer those with a normal close.
		const sendable = (code === 1000 || (code >= 3000 && code < 5000)) as boolean;
		ws.close(sendable ? code : 1000);
	}

	/** Tell every open tab that something changed. */
	protected broadcast(message: LiveMessage): void {
		const text = JSON.stringify(message);
		for (const ws of this.ctx.getWebSockets()) {
			try {
				ws.send(text);
			} catch {
				// A socket that is closing; the tab reconnects and refetches.
			}
		}
	}

	/** Create or update this user's tables (a new object, after stop(), or an older version). */
	protected async migrate() {
		const from = (await this.ctx.storage.get<number>('schema')) ?? 0;
		if (from >= SCHEMA_VERSION) return;
		const step = MIGRATIONS[from];
		this.transaction(() => this.ctx.storage.sql.exec(step.sql));
		if (step.resetKeys.length) await this.ctx.storage.delete(step.resetKeys);
		if (from === 1) {
			const old = await this.ctx.storage.get<string>('settings');
			await this.ctx.storage.put(
				'settings',
				JSON.stringify(settingsFromV1(JSON.parse(old || '{}') as Record<string, unknown>))
			);
		}
		await this.ctx.storage.put('schema', SCHEMA_VERSION);
	}

	// --- SQL ------------------------------------------------------------------------------

	protected all<T>(query: string, ...args: SqlValue[]): T[] {
		return this.ctx.storage.sql.exec(query, ...args).toArray() as T[];
	}

	protected one<T>(query: string, ...args: SqlValue[]): T | null {
		return this.all<T>(query, ...args)[0] ?? null;
	}

	/** Run a write; returns the rows written (indexes count too, as the free plan counts them). */
	protected run(query: string, ...args: SqlValue[]): number {
		return this.ctx.storage.sql.exec(query, ...args).rowsWritten;
	}

	/** All or nothing: an error inside rolls every write back. */
	protected transaction<T>(fn: () => T): T {
		return this.ctx.storage.transactionSync(fn);
	}

	/** Items with their subject's facts, for a WHERE on item columns. */
	protected items(where: string, ...args: SqlValue[]): ItemWithFacts[] {
		return this.all<ItemWithFacts>(`${ITEMS} WHERE ${where}`, ...args);
	}

	// --- The user -------------------------------------------------------------------------

	/** The signed-in user's account (identity and token are global, in D1). */
	protected async account(): Promise<UserRow | null> {
		const userId = await this.ctx.storage.get<number>('userId');
		return userId ? getUser(this.env, userId) : null;
	}

	protected async settings(): Promise<Settings> {
		return parseSettings(await this.ctx.storage.get<string>('settings'));
	}

	/** Settings as stored, checked: a value that the checks refuse falls back to its default. */
	protected async checkedSettings(): Promise<Settings> {
		const s = await this.settings();
		for (const k of Object.keys(s) as (keyof Settings)[])
			if (validateSettings(s, [k]))
				(s as unknown as Record<string, unknown>)[k] = DEFAULT_SETTINGS[k];
		return s;
	}

	/** Stores only what differs from the defaults (see settingsOverrides). */
	protected async saveSettings(settings: Settings): Promise<void> {
		await this.ctx.storage.put('settings', JSON.stringify(settingsOverrides(settings)));
		this.broadcast({ type: 'settings' });
	}

	/** The user and what a piece of work needs about them, or null when signed out. */
	protected async who(): Promise<Who | null> {
		const user = await this.account();
		if (!user) return null;
		const settings = await this.checkedSettings();
		return {
			userId: user.id,
			me: user.login,
			token: await userToken(this.env, user),
			settings,
			myTeams: (await this.teams()).teams
				.map((t) => t.slug)
				.filter((slug) => !settings.excludedTeams.includes(slug))
		};
	}

	/** The items changed: the next request for them gets fresh data (see listItems). */
	protected async bumpVersion(): Promise<void> {
		const v = (await this.ctx.storage.get<number>('itemsVersion')) ?? 0;
		await this.ctx.storage.put('itemsVersion', v + 1);
		this.broadcast({ type: 'items' });
	}

	/** Write only the values that changed. Each written key counts against the daily row budget. */
	protected async putChanged(values: Record<string, unknown>): Promise<void> {
		const old = await this.ctx.storage.get(Object.keys(values));
		const changed = Object.fromEntries(
			Object.entries(values).filter(([k, v]) => JSON.stringify(old.get(k)) !== JSON.stringify(v))
		);
		if (Object.keys(changed).length) await this.ctx.storage.put(changed);
	}

	/** Your GitHub teams, cached for 6 hours. */
	async teams(force = false): Promise<{ teams: TeamDTO[]; error?: string }> {
		const cached = await this.ctx.storage.get<{ teams: TeamDTO[]; at: number }>('teams');
		if (!force && cached && Date.now() - cached.at < TEAMS_TTL) return { teams: cached.teams };
		const user = await this.account();
		if (!user) return { teams: cached?.teams ?? [], error: 'Not signed in.' };
		const res = await fetchTeams(await userToken(this.env, user), user.login);
		if (res.error && cached) return { teams: cached.teams, error: res.error };
		await this.ctx.storage.put('teams', { teams: res.teams, at: Date.now() });
		return res;
	}

	/** Sign-out of everything: the alarm and all of this user's data. */
	async stop(): Promise<void> {
		await this.ctx.storage.deleteAlarm();
		await this.ctx.storage.deleteAll();
	}
}
