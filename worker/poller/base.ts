import { DurableObject } from 'cloudflare:workers';
import type { Settings, TeamDTO } from '../../src/lib/shared/types';
import { getUser, parseSettings, userToken, type Env, type UserRow } from '../db';
import { fetchTeams } from '../github';
import { SCHEMA, SCHEMA_VERSION, THREADS, type ThreadWithFacts } from './schema';
import { TEAMS_TTL, type Who } from './shared';

/** A value SQLite can bind: strings, numbers, null (no booleans, no undefined). */
export type SqlValue = string | number | null;

/**
 * One Durable Object per user. This base has the user's own SQLite database (schema.ts), their
 * settings, and who they are; the layers above add alerts, the subject store, the notification
 * sync, the dashboards, and the API's data methods.
 */
export abstract class PollerBase extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		// The tables exist before any request or alarm runs.
		void ctx.blockConcurrencyWhile(() => this.migrate());
	}

	/** Create this user's tables if they are missing (a new object, or after stop()). */
	protected async migrate() {
		if (((await this.ctx.storage.get<number>('schema')) ?? 0) >= SCHEMA_VERSION) return;
		this.transaction(() => this.ctx.storage.sql.exec(SCHEMA));
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

	/** Threads with their subject's facts, for a WHERE on thread columns. */
	protected threads(where: string, ...args: SqlValue[]): ThreadWithFacts[] {
		return this.all<ThreadWithFacts>(`${THREADS} WHERE ${where}`, ...args);
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

	protected async saveSettings(settings: Settings): Promise<void> {
		await this.ctx.storage.put('settings', JSON.stringify(settings));
	}

	/** The user and what a piece of work needs about them, or null when signed out. */
	protected async who(): Promise<Who | null> {
		const user = await this.account();
		if (!user) return null;
		const settings = await this.settings();
		return {
			userId: user.id,
			me: user.login,
			token: await userToken(this.env, user),
			settings,
			inboxTeams: settings.teamReviewsAreAction ? (await this.teams()).teams.map((t) => t.slug) : []
		};
	}

	/** The inbox lists changed: the next request for them gets fresh data (see listThreads). */
	protected async bumpVersion(): Promise<void> {
		const v = (await this.ctx.storage.get<number>('threadsVersion')) ?? 0;
		await this.ctx.storage.put('threadsVersion', v + 1);
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
