import { toast } from 'svelte-sonner';
import { api } from '$lib/api';
import { keys, queryClient, refetchUnlessLive } from '$lib/queries';
import type { CategoryPin } from '$lib/shared/categories';
import { snoozeLabel, type SnoozeChoice } from '$lib/shared/item-snooze';
import type { CategoryGroup, DashItem, DashKind, DashResponse } from '$lib/shared/types';

export const UNTIL_NEW_ACTIVITY: SnoozeChoice = {};

const DASH_KINDS: DashKind[] = ['pr', 'issue'];
const SEEN_BATCH = 50;

const dashKeysOf = (items: DashItem[]) =>
	[...new Set(items.map((i) => i.kind))].map((kind) => keys.dash(kind));

const cancelDash = (items: DashItem[]) =>
	Promise.all(dashKeysOf(items).map((queryKey) => queryClient.cancelQueries({ queryKey })));

function invalidateDash(items: DashItem[]) {
	for (const queryKey of dashKeysOf(items)) queryClient.invalidateQueries({ queryKey });
}

const refetchDash = (items: DashItem[]) => refetchUnlessLive(...dashKeysOf(items));

export const willMute = (items: Pick<DashItem, 'muted'>[]) => !items.every((i) => i.muted);

function dashItemsOf(ids: string[]): DashItem[] {
	const cached = DASH_KINDS.flatMap(
		(kind) => queryClient.getQueryData<DashResponse>(keys.dash(kind))?.items ?? []
	);
	const byId = new Map(cached.map((i) => [i.id, i]));
	return ids.flatMap((id) => byId.get(id) ?? []);
}

function patchDashItems(ids: Set<string>, patch: (x: DashItem) => DashItem) {
	for (const kind of DASH_KINDS)
		queryClient.setQueryData<DashResponse>(keys.dash(kind), (old) =>
			old?.items.some((x) => ids.has(x.id))
				? { ...old, items: old.items.map((x) => (ids.has(x.id) ? patch(x) : x)) }
				: old
		);
}

const describe = (items: DashItem[]) =>
	items.length === 1 ? items[0].title : `${items.length} items`;

function sendInBatches(ids: string[], send: (batch: string[]) => Promise<unknown>) {
	const batches = Array.from({ length: Math.ceil(ids.length / SEEN_BATCH) }, (_, k) =>
		ids.slice(k * SEEN_BATCH, (k + 1) * SEEN_BATCH)
	);
	return Promise.all(batches.map(send));
}

export async function toggleMuteItems(ids: string[]) {
	const items = dashItemsOf(ids);
	if (!items.length) return;
	const mute = willMute(items);
	const set = new Set(items.map((i) => i.id));
	await cancelDash(items);
	patchDashItems(set, (x) => ({ ...x, dismissed: mute, muted: mute, snooze: undefined }));
	try {
		if (mute) await api.muteItems([...set]);
		else await api.unsnoozeItems([...set]);
		toast(mute ? 'Muted' : 'Unmuted', {
			description: describe(items),
			action: mute ? { label: 'Undo', onClick: () => void unsnoozeItems([...set]) } : undefined
		});
	} catch (err) {
		invalidateDash(items);
		toast.error((err as Error).message);
	}
}

export async function snoozeItems(ids: string[], choice: SnoozeChoice) {
	const items = dashItemsOf(ids);
	if (!items.length) return;
	const set = new Set(items.map((i) => i.id));
	await cancelDash(items);
	patchDashItems(set, (x) => ({ ...x, dismissed: true, muted: false, snooze: choice }));
	try {
		await api.snoozeItems(
			items.map((i) => ({ id: i.id, updatedAt: i.updatedAt })),
			choice
		);
		toast(`Snoozed ${snoozeLabel(choice).replace(/^Until/, 'until')}`, {
			description: describe(items),
			action: {
				label: 'Undo',
				onClick: () => {
					patchDashItems(set, (x) => ({ ...x, dismissed: false, snooze: undefined }));
					api.unsnoozeItems([...set]).catch((e) => {
						toast.error(e.message);
						invalidateDash(items);
					});
				}
			}
		});
	} catch (err) {
		invalidateDash(items);
		toast.error((err as Error).message);
	}
}

export async function unsnoozeItems(ids: string[]) {
	const items = dashItemsOf(ids);
	if (!items.length) return;
	const set = new Set(items.map((i) => i.id));
	await cancelDash(items);
	patchDashItems(set, (x) => ({ ...x, dismissed: false, muted: false, snooze: undefined }));
	try {
		await api.unsnoozeItems([...set]);
		toast('Back in the list', { description: describe(items) });
	} catch (err) {
		invalidateDash(items);
		toast.error((err as Error).message);
	}
}

export async function markItemsSeen(ids: string[]) {
	const items = dashItemsOf(ids);
	const unread = items.filter((i) => i.unread);
	if (unread.length) {
		await cancelDash(unread);
		patchDashItems(new Set(unread.map((i) => i.id)), (x) => ({ ...x, unread: false }));
	}
	sendInBatches(ids, api.seen).catch(() => invalidateDash(items));
}

export async function setItemsRead(ids: string[], read: boolean) {
	const items = dashItemsOf(ids);
	await cancelDash(items);
	patchDashItems(new Set(ids), (x) => ({
		...x,
		unread: !read,
		...(read ? { seenAt: Date.now(), changes: [] } : { seenAt: null })
	}));
	try {
		await sendInBatches(ids, read ? api.seen : api.unseen);
	} catch (err) {
		invalidateDash(items);
		toast.error((err as Error).message);
	}
}

async function sendPin(
	ids: string[],
	pin: CategoryPin,
	patch: (x: DashItem) => DashItem,
	message: string
) {
	const items = dashItemsOf(ids);
	await cancelDash(items);
	patchDashItems(new Set(ids), patch);
	try {
		await api.pinItems(ids, pin);
		toast(message, { description: describe(items) });
		refetchDash(items);
	} catch (err) {
		toast.error((err as Error).message);
		invalidateDash(items);
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
	const anyUnread = dashItemsOf(ids).some((i) => i.unread);
	return setItemsRead(ids, anyUnread);
}

export async function copyLinks(urls: string[]) {
	await navigator.clipboard.writeText(urls.join('\n'));
	toast.success(urls.length === 1 ? 'Link copied' : `${urls.length} links copied`);
}
