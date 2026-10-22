export type ItemField = 'labels' | 'assignees';

export interface RepoLabel {
	name: string;
	color: string;
	description: string | null;
}

export interface AssignableUser {
	login: string;
	name: string | null;
	avatar: string | null;
}

export interface ItemFieldEdit {
	repo: string;
	number: number;
	field: ItemField;
	add: string[];
	remove: string[];
}

export const MAX_ASSIGNEES = 10;
export const MAX_LABEL_NAME = 50;
export const MAX_FIELD_CHANGES = 20;
export const FIELD_SEARCH_MAX = 100;

const TRIAGE_PERMISSIONS = new Set(['ADMIN', 'MAINTAIN', 'WRITE', 'TRIAGE']);

export const canEditItemFields = (permission: string | null | undefined): boolean =>
	!!permission && TRIAGE_PERMISSIONS.has(permission);

const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

const validValue: Record<ItemField, (value: unknown) => value is string> = {
	labels: (value): value is string =>
		typeof value === 'string' && !!value.trim() && value.length <= MAX_LABEL_NAME,
	assignees: (value): value is string => typeof value === 'string' && LOGIN.test(value)
};

export const isItemField = (value: unknown): value is ItemField =>
	value === 'labels' || value === 'assignees';

export function validItemFieldChanges(
	field: ItemField,
	add: unknown,
	remove: unknown
): { add: string[]; remove: string[] } | null {
	if (!Array.isArray(add) || !Array.isArray(remove)) return null;
	if (!add.length && !remove.length) return null;
	if (add.length + remove.length > MAX_FIELD_CHANGES) return null;
	if (![...add, ...remove].every(validValue[field])) return null;
	return { add: [...new Set(add as string[])], remove: [...new Set(remove as string[])] };
}

export function withFieldChange<T>(
	current: T[],
	key: (value: T) => string,
	change: { add: T[]; remove: string[] }
): T[] {
	const removed = new Set(change.remove.map((name) => name.toLowerCase()));
	const kept = current.filter((value) => !removed.has(key(value).toLowerCase()));
	const present = new Set(kept.map((value) => key(value).toLowerCase()));
	return [...kept, ...change.add.filter((value) => !present.has(key(value).toLowerCase()))];
}
