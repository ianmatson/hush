import { expandSearches } from '../../src/lib/shared/turn';
import { subjectKey } from '../../src/lib/shared/subject';
import { searchGitHub } from '../github';
import { SEARCH_EVERY, type Who } from './shared';
import { PollerSync } from './sync';

/**
 * Tracked searches: GitHub searches that find items with no recent notification (an old review
 * request, your open PRs, what is assigned to you). Their results are a source of items, like
 * notifications. They run every SEARCH_EVERY while Hush polls, and first of all after sign-in,
 * so that Your turn fills in seconds.
 */
export abstract class PollerSearches extends PollerSync {
	private searching: Promise<{ errors: string[] }> | null = null;

	protected runSearches(who: Who, force = false): Promise<{ errors: string[] }> {
		this.searching ??= this.search(who, force).finally(() => (this.searching = null));
		return this.searching;
	}

	private async search(who: Who, force: boolean): Promise<{ errors: string[] }> {
		const { searches, searchScope, excludedTeams } = who.settings;
		const sig = JSON.stringify([searches, searchScope, excludedTeams]);
		const last = await this.ctx.storage.get<{ at: number; sig: string }>('searched');
		if (!force && last?.sig === sig && Date.now() - last.at < SEARCH_EVERY) return { errors: [] };

		const { teams, error: teamError } = await this.teams();
		const { queries, skipped } = expandSearches(
			searches,
			{ scope: searchScope, excludedTeams },
			teams
		);
		// Each search asks for about its last count (GitHub prices what a search asks for).
		const lastCounts = (await this.ctx.storage.get<Record<string, number>>('searchCounts')) ?? {};
		const { hits, errors, counts } = await searchGitHub(who.token, who.me, queries, lastCounts);
		await this.putChanged({ searchCounts: counts });

		const { before } = this.storeSubjects(hits.map((h) => h.subject));
		// The first run after sign-in finds what was already there: no pushes for it.
		const quiet = !last;
		await this.upsertItems(
			who,
			hits.map((h) => ({
				key: subjectKey(h.subject.repo, h.subject.number),
				repo: h.subject.repo,
				number: h.subject.number,
				subjectType: h.subject.kind === 'pr' ? 'PullRequest' : 'Issue',
				title: h.subject.title,
				url: h.subject.url,
				source: `search:${h.section}`,
				create: true
			})),
			{ quiet, before }
		);
		const all = [...(teamError ? [teamError] : []), ...errors, ...Object.values(skipped)];
		await this.ctx.storage.put('searched', { at: Date.now(), sig });
		await this.putChanged({ searchErrors: all.slice(0, 3) });
		return { errors: all };
	}
}
