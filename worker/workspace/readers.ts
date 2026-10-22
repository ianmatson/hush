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
	subjectNumber
} from '../github';
import { decide, decisionsAvailable, type DecisionEnv } from '../decide';
import { boardShort, itemStatuses } from '../projects';
import type { NotificationCursor } from './work';
import type { NotificationsResult, Readers, SourcesResult } from './workspace';

const SECOND_MS = 1000;

type ShortSearch = typeof searchShort;

export async function readSources(
	token: string,
	specs: SourceSpec[],
	run: { search: ShortSearch; board: ShortSearch }
): Promise<SourcesResult> {
	const queries = (adapter: SourceSpec['adapter']): ExpandedQuery[] =>
		specs
			.filter((spec) => spec.adapter === adapter)
			.map((spec) => ({ section: spec.id, q: spec.query }));
	const [searched, boards] = await Promise.all([
		run.search(token, queries('search')),
		run.board(token, queries('board'))
	]);
	const failed = new Set([...searched.failedSections, ...boards.failedSections]);
	const errors = [...searched.errors, ...boards.errors];
	const candidates = new Map<string, Map<string, SourceCandidate>>();
	for (const hit of [...searched.hits, ...boards.hits]) {
		const found = candidates.get(hit.query.section) ?? new Map<string, SourceCandidate>();
		const known = found.get(hit.id);
		if (!known || hit.updatedAt > known.updatedAt)
			found.set(hit.id, { id: hit.id, updatedAt: hit.updatedAt });
		candidates.set(hit.query.section, found);
	}
	const reads = new Map<string, SourceRead>(
		specs.map((spec) => {
			if (failed.has(spec.id))
				return [
					spec.id,
					{ outcome: 'failed', error: errors[0] ?? 'GitHub did not return this search.' }
				];
			const found = [...(candidates.get(spec.id)?.values() ?? [])];
			return [
				spec.id,
				{
					outcome: 'ok',
					window: { candidates: found, truncated: found.length >= SOURCE_RESULTS_MAX }
				}
			];
		})
	);
	return { reads };
}

export async function readNotifications(
	token: string,
	cursor: NotificationCursor
): Promise<NotificationsResult> {
	let page;
	try {
		page = await listNotifications(token, {
			ifModifiedSince: cursor.initialized ? cursor.lastModified : null
		});
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

export function githubReaders(token: string, me: string): Readers {
	return {
		notifications: (cursor) => readNotifications(token, cursor),
		sources: (specs) => readSources(token, specs, { search: searchShort, board: boardShort }),
		async items(ids) {
			const { read, inaccessible, failed } = await fetchItems(token, me, ids);
			return { read, inaccessible, failed };
		},
		async teams() {
			const { teams, error } = await fetchTeams(token, me);
			return error ? null : teams;
		},
		async projects(ids) {
			const result = await itemStatuses(token, ids).catch(() => null);
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
