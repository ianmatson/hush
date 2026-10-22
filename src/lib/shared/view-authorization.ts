import { keepsClosed } from './closed-items';
import { compileExpr, splitSearch, type QueryExpr } from './query';
import type { ItemView, Settings } from './types';

const PRESENTATION_GROUPS = new Set([
	'none',
	'role',
	'status',
	'repo',
	'author',
	'label',
	'assignee'
]);

function without(value: object, keys: string[]): Record<string, unknown> {
	return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
}

function usesCategories(expr: QueryExpr): boolean {
	switch (expr.kind) {
		case 'match':
			return !!expr.when.category?.length;
		case 'not':
			return usesCategories(expr.part);
		case 'and':
		case 'or':
			return expr.parts.some(usesCategories);
	}
}

export function viewAuthorization(view: ItemView) {
	return {
		...without(view, ['name', 'sort', 'pushNew', 'sections']),
		id: view.id,
		groupBy: PRESENTATION_GROUPS.has(view.groupBy) ? 'items' : view.groupBy,
		keepClosed: keepsClosed(view),
		sections: view.sections?.map((section) => without(section, ['name'])),
		sort: view.sort ? without(view.sort, ['by', 'dir', 'turnFirst']) : {}
	};
}

export function settingsAuthorization(settings: Settings) {
	const categoryDependent = settings.views.some(
		(view) =>
			view.groupBy.startsWith('category:') ||
			view.searches.some((search) => usesCategories(compileExpr(splitSearch(search).hush))) ||
			view.sections?.some((section) => usesCategories(compileExpr(section.rule)))
	);
	return {
		...without(settings, [
			'pushFacts',
			'quietHours',
			'pushRepeat',
			'pushDigestMinutes',
			'pushLimit',
			'pushWhileOpen',
			'pushUrgentNow',
			'alertChannels',
			'clearNotifications',
			'menus',
			'keys',
			'swipe',
			'rows',
			'rowLayout',
			'openItems',
			'tableColumns'
		]),
		views: settings.views
			.map(viewAuthorization)
			.sort((a, b) => String(a.id).localeCompare(String(b.id))),
		categoryGroups: categoryDependent ? settings.categoryGroups : []
	};
}

function canonical(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonical);
	if (value !== null && typeof value === 'object')
		return Object.fromEntries(
			Object.entries(value)
				.filter(([, entry]) => entry !== undefined)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, entry]) => [key, canonical(entry)])
		);
	return value;
}

export const authorizationJson = (value: unknown) => JSON.stringify(canonical(value));

async function fingerprint(value: unknown): Promise<string> {
	const hash = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(authorizationJson(value))
	);
	return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const fingerprintView = async (view: ItemView) =>
	`v2:${await fingerprint(viewAuthorization(view))}`;
