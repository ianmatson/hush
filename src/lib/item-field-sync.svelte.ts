import { SvelteMap } from 'svelte/reactivity';
import { api } from '$lib/api';
import { itemFieldWriteQueue } from '$lib/item-field-writes';
import { keys, queryClient, refetchUnlessLive } from '$lib/queries';
import { pendingEditValue, type PendingFieldEdit } from '$lib/shared/item-fields';
import { subjectKey } from '$lib/shared/subject';

type NewFieldEdit = PendingFieldEdit extends infer E
	? E extends unknown
		? Omit<E, 'id'>
		: never
	: never;

const pending = new SvelteMap<string, PendingFieldEdit[]>();
let lastEditId = 0;

const NO_EDITS: PendingFieldEdit[] = [];

export const pendingFieldEdits = (repo: string, number: number): PendingFieldEdit[] =>
	pending.get(subjectKey(repo, number)) ?? NO_EDITS;

function changePending(key: string, change: (edits: PendingFieldEdit[]) => PendingFieldEdit[]) {
	const next = change(pending.get(key) ?? NO_EDITS);
	if (next.length) pending.set(key, next);
	else pending.delete(key);
}

const write = itemFieldWriteQueue(api.editItemField, async ({ repo, number }) => {
	const key = subjectKey(repo, number);
	const settled = new Set((pending.get(key) ?? NO_EDITS).map((e) => e.id));
	refetchUnlessLive(keys.items);
	await queryClient.refetchQueries({ queryKey: keys.peek(repo, number) }).catch(() => undefined);
	changePending(key, (edits) => edits.filter((e) => !settled.has(e.id)));
});

export async function editItemField(repo: string, number: number, edit: NewFieldEdit) {
	const key = subjectKey(repo, number);
	const id = ++lastEditId;
	changePending(key, (edits) => [...edits, { ...edit, id } as PendingFieldEdit]);
	const value = pendingEditValue({ ...edit, id } as PendingFieldEdit);
	try {
		await write({
			repo,
			number,
			field: edit.field,
			add: edit.on ? [value] : [],
			remove: edit.on ? [] : [value]
		});
	} catch (err) {
		changePending(key, (edits) => edits.filter((e) => e.id !== id));
		throw err;
	}
}
