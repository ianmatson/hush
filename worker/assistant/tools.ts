import { viewKinds } from '../../src/lib/shared/item-views';
import { savedViewSections, viewPopulation } from '../../src/lib/shared/view-projection';
import type { DashKind, ItemView } from '../../src/lib/shared/types';
import { keepsClosed } from '../../src/lib/shared/closed-items';
import { sortOfView } from '../../src/lib/shared/sorting';
import type { SavedViewsSnapshot } from './snapshot';

export const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;
const MAX_CURSOR_LENGTH = 1024;

export interface PageInput {
	limit?: number;
	cursor?: string;
}

export interface GetViewInput extends PageInput {
	view_id: string;
	kind?: DashKind | 'both';
}

export type ToolErrorCode =
	| 'invalid_arguments'
	| 'invalid_cursor'
	| 'snapshot_changed'
	| 'view_not_found'
	| 'snapshot_unavailable';

export type ToolResult<T> = { ok: true; data: T } | { ok: false; error: { code: ToolErrorCode } };

class ToolFailure extends Error {
	constructor(public readonly code: ToolErrorCode) {
		super(code);
	}
}

const viewInfo = (view: ItemView) => ({
	id: view.id,
	name: view.name,
	searches: view.searches,
	kinds: viewKinds(view),
	groupBy: view.groupBy,
	sort: sortOfView(view),
	keepClosed: keepsClosed(view),
	sections: view.sections
});

async function revisionOf(value: unknown): Promise<string> {
	const hash = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(JSON.stringify(value))
	);
	return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function pageLimit(input: PageInput): number {
	const limit = input.limit ?? DEFAULT_PAGE_SIZE;
	if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE)
		throw new ToolFailure('invalid_arguments');
	if (input.cursor !== undefined && typeof input.cursor !== 'string')
		throw new ToolFailure('invalid_arguments');
	return limit;
}

function offsetOf(cursor: string | undefined, revision: string, total: number): number {
	if (cursor === undefined) return 0;
	if (!cursor || cursor.length > MAX_CURSOR_LENGTH) throw new ToolFailure('invalid_cursor');
	let value;
	try {
		value = JSON.parse(atob(cursor));
	} catch {
		throw new ToolFailure('invalid_cursor');
	}
	if (
		value?.version !== 1 ||
		typeof value.revision !== 'string' ||
		!Number.isSafeInteger(value.offset) ||
		value.offset <= 0
	)
		throw new ToolFailure('invalid_cursor');
	if (value.revision !== revision) throw new ToolFailure('snapshot_changed');
	if (value.offset >= total) throw new ToolFailure('invalid_cursor');
	return value.offset;
}

function nextCursor(offset: number, limit: number, total: number, revision: string): string | null {
	return offset + limit < total
		? btoa(JSON.stringify({ version: 1, offset: offset + limit, revision }))
		: null;
}

async function resultOf<T>(read: () => Promise<T>): Promise<ToolResult<T>> {
	try {
		return { ok: true, data: await read() };
	} catch (error) {
		if (error instanceof ToolFailure) return { ok: false, error: { code: error.code } };
		return { ok: false, error: { code: 'snapshot_unavailable' } };
	}
}

export function createSavedViewTools(readSnapshot: () => Promise<SavedViewsSnapshot>) {
	return {
		list_views: (input: PageInput = {}) =>
			resultOf(async () => {
				const limit = pageLimit(input);
				const snapshot = await readSnapshot();
				const views = snapshot.views.map(viewInfo);
				const revision = await revisionOf([snapshot.principal, views]);
				const offset = offsetOf(input.cursor, revision, views.length);
				return {
					views: views.slice(offset, offset + limit),
					total: views.length,
					revision,
					nextCursor: nextCursor(offset, limit, views.length, revision)
				};
			}),
		get_view: (input: GetViewInput) =>
			resultOf(async () => {
				const limit = pageLimit(input);
				if (typeof input.view_id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(input.view_id))
					throw new ToolFailure('invalid_arguments');
				if (input.kind !== undefined && !['both', 'pr', 'issue'].includes(input.kind))
					throw new ToolFailure('invalid_arguments');
				const snapshot = await readSnapshot();
				const view = snapshot.views.find((v) => v.id === input.view_id);
				if (!view) throw new ToolFailure('view_not_found');
				const kinds = viewKinds(view).filter(
					(k) => !input.kind || input.kind === 'both' || k === input.kind
				);
				if (!kinds.length) throw new ToolFailure('invalid_arguments');
				const dashboards = kinds.map((kind) => snapshot.dashboards.find((d) => d.kind === kind)!);
				const data = dashboards.flatMap((d) => (d.data ? [d.data] : []));
				const freshness = dashboards.map((d) => ({
					kind: d.kind,
					state: d.state,
					fetchedAt: d.fetchedAt,
					errors: d.data?.errors ?? [],
					skipped: d.data?.sections.find((s) => s.id === view.id)?.skipped ?? null
				}));
				const population = viewPopulation(
					data.flatMap((d) => d.items),
					view,
					snapshot.categoryGroups
				);
				const projects = [
					...new Map(data.flatMap((d) => d.projects ?? []).map((p) => [p.key, p])).values()
				];
				const sections = savedViewSections(
					population,
					view,
					{
						me: snapshot.principal.login,
						categoryGroups: snapshot.categoryGroups,
						projects
					},
					kinds
				);
				const rows = sections.flatMap((section, index) =>
					section.items.map((item) => ({ index, item }))
				);
				const revision = await revisionOf([
					snapshot.principal,
					viewInfo(view),
					kinds,
					snapshot.categoryGroups,
					sections,
					freshness
				]);
				const offset = offsetOf(input.cursor, revision, rows.length);
				const page = rows.slice(offset, offset + limit);
				return {
					view: viewInfo(view),
					categoryGroups: snapshot.categoryGroups.map((group) => ({
						id: group.id,
						name: group.name,
						categories: group.categories.map(({ id, name, color, icon }) => ({
							id,
							name,
							color,
							icon
						}))
					})),
					freshness,
					complete: dashboards.every(
						(d) =>
							!!d.data &&
							!d.data.errors.length &&
							!d.data.sections.some((s) => s.id === view.id && s.skipped)
					),
					totalItems: population.length,
					totalRows: rows.length,
					groups: sections.flatMap(({ items, ...section }, index) => {
						const shown = page.filter((row) => row.index === index).map((row) => row.item);
						return shown.length ? [{ ...section, totalItems: items.length, items: shown }] : [];
					}),
					revision,
					nextCursor: nextCursor(offset, limit, rows.length, revision)
				};
			})
	};
}

export type SavedViewTools = ReturnType<typeof createSavedViewTools>;
