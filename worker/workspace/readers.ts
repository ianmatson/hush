import type { ExpandedQuery } from '../../src/lib/shared/dashboard';
import { SOURCE_RESULTS_MAX } from '../../src/lib/shared/item-views';
import type { SourceRead } from '../../src/lib/model/sources';
import type { SourceCandidate, SourceSpec } from '../../src/lib/model/types';
import {
	fetchItems,
	fetchTeams,
	githubStatusMessage,
	listNotifications,
	searchShort,
	subjectNumber,
	type CallBudget,
	type SearchHit
} from '../github';
import { decide, decisionsAvailable, type DecisionEnv } from '../decide';
import { boardShort, itemStatuses } from '../projects';
import type { NotificationCursor } from './work';
import type { NotificationsResult, Readers } from './engine';

const SECOND_MS = 1000;

export interface Credential {
	token: string;
	me: string;
}

interface ShortResult {
	hits: SearchHit[];
	errors: string[];
	failedSections: Set<string>;
	failedQueries: ExpandedQuery[];
	truncatedSections?: Set<string>;
}

type ShortReader = (
	token: string,
	queries: ExpandedQuery[],
	budget?: CallBudget
) => Promise<ShortResult>;

export async function readSources(
	token: string,
	specs: SourceSpec[],
	budget: CallBudget,
	run: { search: ShortReader; board: ShortReader }
): Promise<Map<string, SourceRead>> {
	const queries = (adapter: SourceSpec['adapter']): ExpandedQuery[] =>
		specs
			.filter((spec) => spec.adapter === adapter)
			.map((spec) => ({ section: spec.id, q: spec.query }));
	const searched = await run.search(token, queries('search'), budget);
	const boards = await run.board(token, queries('board'), budget);
	const failed = new Set([...searched.failedSections, ...boards.failedSections]);
	const retryable = new Set(
		[...searched.failedQueries, ...boards.failedQueries].map((query) => query.section)
	);
	const truncated = new Set([...(boards.truncatedSections ?? [])]);
	const errors = [...searched.errors, ...boards.errors];
	const candidates = new Map<string, Map<string, SourceCandidate>>();
	for (const hit of [...searched.hits, ...boards.hits]) {
		const found = candidates.get(hit.query.section) ?? new Map<string, SourceCandidate>();
		const known = found.get(hit.id);
		if (!known || hit.updatedAt > known.updatedAt)
			found.set(hit.id, { id: hit.id, updatedAt: hit.updatedAt });
		candidates.set(hit.query.section, found);
	}
	return new Map<string, SourceRead>(
		specs.map((spec): [string, SourceRead] => {
			const error = errors[0] ?? 'GitHub did not return this search.';
			if (failed.has(spec.id))
				return [
					spec.id,
					spec.adapter === 'board' && !retryable.has(spec.id)
						? { outcome: 'gone', error }
						: { outcome: 'failed', error }
				];
			const found = [...(candidates.get(spec.id)?.values() ?? [])];
			return [
				spec.id,
				{
					outcome: 'ok',
					window: {
						candidates: found,
						truncated: truncated.has(spec.id) || found.length >= SOURCE_RESULTS_MAX
					}
				}
			];
		})
	);
}

export async function readNotifications(
	token: string,
	cursor: NotificationCursor,
	budget?: CallBudget
): Promise<NotificationsResult> {
	let page;
	try {
		page = await listNotifications(
			token,
			{ ifModifiedSince: cursor.initialized ? cursor.lastModified : null },
			budget
		);
	} catch (error) {
		return { status: 'failed', error: `Network error: ${(error as Error).message}` };
	}
	const pollIntervalMs = page.pollInterval * SECOND_MS;
	if (page.status === 304) return { status: 'not-modified', pollIntervalMs };
	if (page.status === 401) return { status: 'unauthorized' };
	if ((page.status === 403 || page.status === 429) && page.retryAt !== undefined)
		return { status: 'rate-limited', retryAt: page.retryAt };
	if (page.status !== 200) return { status: 'failed', error: githubStatusMessage(page.status) };
	return {
		status: 'ok',
		pollIntervalMs,
		lastModified: page.lastModified,
		threads: page.items.flatMap((notification) => {
			const number = subjectNumber(notification);
			if (number === null) return [];
			return [
				{
					id: notification.id,
					updatedAt: notification.updated_at,
					repo: notification.repository.full_name,
					number,
					kind: notification.subject.type === 'PullRequest' ? ('pr' as const) : ('issue' as const)
				}
			];
		})
	};
}

export function githubReaders(credential: () => Promise<Credential>): Readers {
	return {
		async notifications(cursor, budget) {
			const { token } = await credential();
			return readNotifications(token, cursor, budget);
		},
		async sources(specs, budget) {
			const { token } = await credential();
			return readSources(token, specs, budget, { search: searchShort, board: boardShort });
		},
		async items(ids, budget) {
			const { token, me } = await credential();
			return fetchItems(token, me, ids, budget).catch(() => ({
				read: [],
				inaccessible: [],
				failed: ids
			}));
		},
		async teams(budget) {
			const { token, me } = await credential();
			const result = await fetchTeams(token, me, budget).catch(() => null);
			return result && !result.error ? result.teams : null;
		},
		async projects(ids, budget) {
			const { token } = await credential();
			const result = await itemStatuses(token, ids, budget).catch(() => null);
			if (!result) return { statusOf: new Map(), incomplete: new Set(ids), definitions: [] };
			const missing = ids.filter((id) => !result.statusOf.has(id));
			return {
				statusOf: result.statusOf,
				incomplete: new Set([...(result.incomplete ?? []), ...missing]),
				definitions: result.projects
			};
		}
	};
}

export function modelAnalyzer(env: DecisionEnv): Readers['analyze'] {
	if (!decisionsAvailable(env)) return undefined;
	return async (request) => {
		const decided = await decide(env, request);
		return decided ? { answers: decided.answers, tokens: decided.tokens } : null;
	};
}
