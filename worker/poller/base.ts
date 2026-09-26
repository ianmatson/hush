import { DurableObject } from 'cloudflare:workers';
import type { TeamDTO } from '../../src/lib/shared/types';
import { subjectUrls } from '../../src/lib/shared/subject';
import { getUser, parseSettings, userToken, type Env, type ThreadRow } from '../db';
import { fetchTeams } from '../github';
import { TEAMS_TTL, type Who } from './shared';

/** Storage helpers, your teams, and the user context every layer needs. */
export abstract class PollerBase extends DurableObject<Env> {
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
		const userId = await this.ctx.storage.get<number>('userId');
		const user = userId ? await getUser(this.env, userId) : null;
		if (!user) return { teams: cached?.teams ?? [], error: 'Not signed in.' };
		const res = await fetchTeams(await userToken(this.env, user), user.login);
		if (res.error && cached) return { teams: cached.teams, error: res.error };
		await this.ctx.storage.put('teams', { teams: res.teams, at: Date.now() });
		return res;
	}

	/** The user and what the subject store needs to update their views, or null. */
	protected async who(): Promise<(Who & { token: string; login: string }) | null> {
		const userId = await this.ctx.storage.get<number>('userId');
		const user = userId ? await getUser(this.env, userId) : null;
		if (!user) return null;
		const settings = parseSettings(user.settings);
		return {
			userId: user.id,
			me: user.login,
			login: user.login,
			settings,
			inboxTeams: settings.teamReviewsAreAction
				? (await this.teams()).teams.map((t) => t.slug)
				: [],
			token: await userToken(this.env, user)
		};
	}

	/** The inbox threads about one PR or issue. */
	protected async threadsOf(userId: number, key: string): Promise<ThreadRow[]> {
		const { results } = await this.env.DB.prepare(
			`SELECT * FROM threads WHERE user_id = ? AND html_url IN (?, ?) AND category != 'muted'`
		)
			.bind(userId, ...subjectUrls(key))
			.all<ThreadRow>();
		return results;
	}

	async stop(): Promise<void> {
		await this.ctx.storage.deleteAlarm();
		await this.ctx.storage.deleteAll();
	}
}
