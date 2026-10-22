import { createQuery, keepPreviousData } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import type { FieldOption } from '$lib/components/app/item-field-picker.svelte';
import { editItemField, pendingFieldEdits } from '$lib/item-field-sync.svelte';
import { assignableUsersQuery, repoLabelsQuery } from '$lib/queries';
import { canEditItemFields, withPendingEdits, type ItemField } from '$lib/shared/item-fields';
import type { PeekDTO } from '$lib/shared/types';

const SEARCH_PAUSE_MS = 200;

export const shownFields = (p: PeekDTO) => withPendingEdits(p, pendingFieldEdits(p.repo, p.number));

export const canEditFields = (p: PeekDTO) => canEditItemFields(p.can.permission);

export function itemFieldEditor(item: () => PeekDTO, field: ItemField) {
	let open = $state(false);
	let search = $state('');
	let term = $state('');

	$effect(() => {
		const next = search.trim();
		const timer = setTimeout(() => (term = next), SEARCH_PAUSE_MS);
		return () => clearTimeout(timer);
	});

	const labels = createQuery(() => ({
		...repoLabelsQuery(item().repo, term),
		enabled: open && field === 'labels',
		placeholderData: keepPreviousData
	}));
	const users = createQuery(() => ({
		...assignableUsersQuery(item().repo, term),
		enabled: open && field === 'assignees',
		placeholderData: keepPreviousData
	}));
	const query = $derived(field === 'labels' ? labels : users);

	const options = $derived<FieldOption[]>(
		field === 'labels'
			? (labels.data ?? []).map((l) => ({
					value: l.name,
					label: l.name,
					detail: l.description,
					color: l.color
				}))
			: (users.data ?? []).map((u) => ({
					value: u.login,
					label: u.login,
					detail: u.name,
					avatar: u.avatar
				}))
	);
	const chosen = $derived.by<FieldOption[]>(() => {
		const shown = shownFields(item());
		return field === 'labels'
			? shown.labels.map((l) => ({ value: l.name, label: l.name, color: l.color }))
			: shown.assignees.map((a) => ({ value: a.login, label: a.login, avatar: a.avatar }));
	});

	async function toggle(option: FieldOption, on: boolean) {
		const p = item();
		const edit =
			field === 'labels'
				? { field, on, label: { name: option.value, color: option.color ?? '' } }
				: {
						field,
						on,
						person: { login: option.value, avatar: option.avatar ?? null, bot: false }
					};
		try {
			await editItemField(p.repo, p.number, edit);
		} catch (err) {
			toast.error((err as Error).message);
		}
	}

	return {
		get open() {
			return open;
		},
		set open(next: boolean) {
			open = next;
		},
		get search() {
			return search;
		},
		set search(next: string) {
			search = next;
		},
		get options() {
			return options;
		},
		get chosen() {
			return chosen;
		},
		get loading() {
			return query.isFetching;
		},
		get error() {
			return query.error?.message ?? null;
		},
		toggle
	};
}
