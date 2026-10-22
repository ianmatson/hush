import { toast } from 'svelte-sonner';
import { api } from '$lib/api';
import { keys, queryClient, refetchUnlessLive } from '$lib/queries';
import type { CategoryPin } from '$lib/shared/categories';
import { snoozeLabel, type SnoozeChoice } from '$lib/shared/item-snooze';
import type { CategoryGroup, DashItem } from '$lib/shared/types';
import type { ItemsResponse } from '$lib/model/present';

export const UNTIL_NEW_ACTIVITY: SnoozeChoice = {};

const SEEN_BATCH = 50;

const cancelItems = () => queryClient.cancelQueries({ queryKey: keys.items });

const invalidateItems = () => queryClient.invalidateQueries({ queryKey: keys.items });

const refetchItems = () => refetchUnlessLive(keys.items);

export const willMute = (items: Pick<DashItem, 'muted'>[]) => !items.every((i) => i.muted);

function cachedRows(ids: string[]): DashItem[] {
	const rows = queryClient.getQueryData<ItemsResponse>(keys.items)?.rows ?? [];
	const byId = new Map(rows.map((row) => [row.id, row]));
	return ids.flatMap((id) => byId.get(id) ?? []);
}

function patchRows(ids: Set<string>, patch: (x: DashItem) => DashItem) {
	queryClient.setQueryData<ItemsResponse>(keys.items, (old) =>
		old?.rows.some((x) => ids.has(x.id))
			? { ...old, rows: old.rows.map((x) => (ids.has(x.id) ? patch(x) : x)) }
			: old
	);
}

const itemIdsOf = (rows: DashItem[]) => rows.map((row) => row.itemId);

const seenMarksOf = (rows: DashItem[]) =>
	rows.map(({ itemId, revision, baseline }) => ({ itemId, revision, baseline }));

const SNOOZE_FIELDS = ['dismissed', 'muted', 'snooze'] as const satisfies (keyof DashItem)[];
const READ_FIELDS = ['unread', 'seenAt', 'changes'] as const satisfies (keyof DashItem)[];
const PIN_FIELDS = ['categories', 'pinnedCategories'] as const satisfies (keyof DashItem)[];

type ActionFields = readonly (keyof DashItem)[];

const pickFields = (item: DashItem, fields: ActionFields): Partial<DashItem> =>
	Object.fromEntries(fields.map((field) => [field, item[field]]));

function patchWithRollback(
	ids: Set<string>,
	fields: ActionFields,
	patch: (x: DashItem) => DashItem
): () => void {
	const before = new Map(cachedRows([...ids]).map((i) => [i.id, pickFields(i, fields)]));
	patchRows(ids, patch);
	return () => patchRows(new Set(before.keys()), (x) => ({ ...x, ...before.get(x.id) }));
}

const describe = (items: DashItem[]) =>
	items.length === 1 ? items[0].title : `${items.length} items`;

function sendInBatches<T>(values: T[], send: (batch: T[]) => Promise<unknown>) {
	const batches = Array.from({ length: Math.ceil(values.length / SEEN_BATCH) }, (_, k) =>
		values.slice(k * SEEN_BATCH, (k + 1) * SEEN_BATCH)
	);
	return Promise.all(batches.map(send));
}

export async function toggleMuteItems(ids: string[]) {
	const items = cachedRows(ids);
	if (!items.length) return;
	const mute = willMute(items);
	const set = new Set(items.map((i) => i.id));
	await cancelItems();
	const rollback = patchWithRollback(set, SNOOZE_FIELDS, (x) => ({
		...x,
		dismissed: mute,
		muted: mute,
		snooze: undefined
	}));
	try {
		if (mute) await api.muteItems(itemIdsOf(items));
		else await api.unsnoozeItems(itemIdsOf(items));
		toast(mute ? 'Muted' : 'Unmuted', {
			description: describe(items),
			action: mute ? { label: 'Undo', onClick: () => void unsnoozeItems([...set]) } : undefined
		});
	} catch (err) {
		rollback();
		invalidateItems();
		toast.error((err as Error).message);
	}
}

export async function snoozeItems(ids: string[], choice: SnoozeChoice) {
	const items = cachedRows(ids);
	if (!items.length) return;
	const set = new Set(items.map((i) => i.id));
	await cancelItems();
	const rollback = patchWithRollback(set, SNOOZE_FIELDS, (x) => ({
		...x,
		dismissed: true,
		muted: false,
		snooze: choice
	}));
	try {
		await api.snoozeItems(itemIdsOf(items), choice);
		toast(`Snoozed ${snoozeLabel(choice).replace(/^Until/, 'until')}`, {
			description: describe(items),
			action: {
				label: 'Undo',
				onClick: () => {
					const undoRollback = patchWithRollback(set, SNOOZE_FIELDS, (x) => ({
						...x,
						dismissed: false,
						snooze: undefined
					}));
					api.unsnoozeItems(itemIdsOf(items)).catch((e) => {
						undoRollback();
						toast.error(e.message);
						invalidateItems();
					});
				}
			}
		});
	} catch (err) {
		rollback();
		invalidateItems();
		toast.error((err as Error).message);
	}
}

export async function unsnoozeItems(ids: string[]) {
	const items = cachedRows(ids);
	if (!items.length) return;
	const set = new Set(items.map((i) => i.id));
	await cancelItems();
	const rollback = patchWithRollback(set, SNOOZE_FIELDS, (x) => ({
		...x,
		dismissed: false,
		muted: false,
		snooze: undefined
	}));
	try {
		await api.unsnoozeItems(itemIdsOf(items));
		toast('Back in the list', { description: describe(items) });
	} catch (err) {
		rollback();
		invalidateItems();
		toast.error((err as Error).message);
	}
}

export async function markItemsSeen(ids: string[]) {
	const items = cachedRows(ids);
	const unread = items.filter((i) => i.unread);
	let rollback = () => {};
	if (unread.length) {
		await cancelItems();
		rollback = patchWithRollback(new Set(unread.map((i) => i.id)), READ_FIELDS, (x) => ({
			...x,
			unread: false
		}));
	}
	sendInBatches(seenMarksOf(items), api.seen).catch(() => {
		rollback();
		invalidateItems();
	});
}

export async function setItemsRead(ids: string[], read: boolean) {
	const items = cachedRows(ids);
	await cancelItems();
	const rollback = patchWithRollback(new Set(ids), READ_FIELDS, (x) => ({
		...x,
		unread: !read,
		...(read ? { seenAt: Date.now(), changes: [] } : { seenAt: null })
	}));
	try {
		await (read
			? sendInBatches(seenMarksOf(items), api.seen)
			: sendInBatches(itemIdsOf(items), api.unseen));
	} catch (err) {
		rollback();
		invalidateItems();
		toast.error((err as Error).message);
	}
}

async function sendPin(
	ids: string[],
	pin: CategoryPin,
	patch: (x: DashItem) => DashItem,
	message: string
) {
	const items = cachedRows(ids);
	await cancelItems();
	const rollback = patchWithRollback(new Set(ids), PIN_FIELDS, patch);
	try {
		await api.pinItems(itemIdsOf(items), pin);
		toast(message, { description: describe(items) });
		refetchItems();
	} catch (err) {
		rollback();
		toast.error((err as Error).message);
		invalidateItems();
	}
}

export function pinItems(ids: string[], pin: CategoryPin, groups: CategoryGroup[]) {
	const group = groups.find((g) => g.id === pin.group);
	const chosen = group?.categories.find((c) => c.id === pin.category);
	if (!group || !chosen) return sendPin(ids, pin, (x) => x, 'Hush chooses the category again');
	const inGroup = new Set(group.categories.map((c) => c.id));
	const replace = (list: string[] | undefined) => [
		...(list ?? []).filter((c) => !inGroup.has(c)),
		chosen.id
	];
	return sendPin(
		ids,
		pin,
		(x) => ({
			...x,
			categories: replace(x.categories),
			pinnedCategories: replace(x.pinnedCategories)
		}),
		`${group.name}: ${chosen.name}`
	);
}

export function toggleItemsRead(ids: string[]) {
	const anyUnread = cachedRows(ids).some((i) => i.unread);
	return setItemsRead(ids, anyUnread);
}

export async function copyLinks(urls: string[]) {
	await navigator.clipboard.writeText(urls.join('\n'));
	toast.success(urls.length === 1 ? 'Link copied' : `${urls.length} links copied`);
}
