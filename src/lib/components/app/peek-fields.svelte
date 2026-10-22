<script lang="ts">
	import { createQuery, keepPreviousData } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { assignableUsersQuery, repoLabelsQuery } from '$lib/queries';
	import { editItemField, pendingFieldEdits } from '$lib/item-field-sync.svelte';
	import {
		MAX_ASSIGNEES,
		canEditItemFields,
		withPendingEdits,
		type ItemField
	} from '$lib/shared/item-fields';
	import { labelUrl, profileUrl } from '$lib/shared/github-links';
	import type { PeekDTO } from '$lib/shared/types';
	import ItemFieldPicker, { type FieldOption } from './item-field-picker.svelte';
	import GhLink from './gh-link.svelte';
	import Tag from '@lucide/svelte/icons/tag';
	import UserPlus from '@lucide/svelte/icons/user-plus';

	let { p }: { p: PeekDTO } = $props();

	const SEARCH_PAUSE_MS = 200;
	const CHIP =
		'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] hover:brightness-95 dark:hover:brightness-125';
	const EDIT_BUTTON =
		'flex h-[1.375rem] items-center gap-1 rounded-full px-1.5 text-[0.7rem] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none data-[state=open]:bg-muted data-[state=open]:text-foreground';
	const EMPTY_BUTTON = `${EDIT_BUTTON} border border-dashed px-2`;

	const editable = $derived(canEditItemFields(p.can.permission));
	const shown = $derived(withPendingEdits(p, pendingFieldEdits(p.repo, p.number)));
	const hasAssignees = $derived(shown.assignees.length > 0);
	const hasLabels = $derived(shown.labels.length > 0);

	let labelsOpen = $state(false);
	let labelSearch = $state('');
	let assigneesOpen = $state(false);
	let assigneeSearch = $state('');

	function afterPause(read: () => string) {
		let settled = $state(read().trim());
		$effect(() => {
			const next = read().trim();
			const timer = setTimeout(() => (settled = next), SEARCH_PAUSE_MS);
			return () => clearTimeout(timer);
		});
		return () => settled;
	}
	const labelTerm = afterPause(() => labelSearch);
	const assigneeTerm = afterPause(() => assigneeSearch);

	const labelsQ = createQuery(() => ({
		...repoLabelsQuery(p.repo, labelTerm()),
		enabled: labelsOpen,
		placeholderData: keepPreviousData
	}));
	const usersQ = createQuery(() => ({
		...assignableUsersQuery(p.repo, assigneeTerm()),
		enabled: assigneesOpen,
		placeholderData: keepPreviousData
	}));

	const chosenLabels = $derived<FieldOption[]>(
		shown.labels.map((l) => ({ value: l.name, label: l.name, color: l.color }))
	);
	const labelOptions = $derived<FieldOption[]>(
		(labelsQ.data ?? []).map((l) => ({
			value: l.name,
			label: l.name,
			detail: l.description,
			color: l.color
		}))
	);
	const chosenAssignees = $derived<FieldOption[]>(
		shown.assignees.map((a) => ({ value: a.login, label: a.login, avatar: a.avatar }))
	);
	const assigneeOptions = $derived<FieldOption[]>(
		(usersQ.data ?? []).map((u) => ({
			value: u.login,
			label: u.login,
			detail: u.name,
			avatar: u.avatar
		}))
	);

	async function toggle(field: ItemField, option: FieldOption, on: boolean) {
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
</script>

{#snippet assigneePicker()}
	<ItemFieldPicker
		label="Assignees"
		tip={hasAssignees ? 'Edit assignees' : 'Assign someone'}
		options={assigneeOptions}
		selected={chosenAssignees}
		loading={usersQ.isFetching}
		error={usersQ.error?.message ?? null}
		full={shown.assignees.length >= MAX_ASSIGNEES}
		fullReason="GitHub allows up to {MAX_ASSIGNEES} assignees."
		bind:search={assigneeSearch}
		bind:open={assigneesOpen}
		ontoggle={(option, on) => toggle('assignees', option, on)}
		triggerClass={hasAssignees ? EDIT_BUTTON : EMPTY_BUTTON}
	>
		{#snippet trigger()}
			<UserPlus class="size-3.5" />{#if !hasAssignees}Assign{/if}
		{/snippet}
	</ItemFieldPicker>
{/snippet}

{#snippet labelPicker()}
	<ItemFieldPicker
		label="Labels"
		tip={hasLabels ? 'Edit labels' : 'Add labels'}
		options={labelOptions}
		selected={chosenLabels}
		loading={labelsQ.isFetching}
		error={labelsQ.error?.message ?? null}
		bind:search={labelSearch}
		bind:open={labelsOpen}
		ontoggle={(option, on) => toggle('labels', option, on)}
		triggerClass={hasLabels ? EDIT_BUTTON : EMPTY_BUTTON}
	>
		{#snippet trigger()}
			<Tag class="size-3.5" />{#if !hasLabels}Label{/if}
		{/snippet}
	</ItemFieldPicker>
{/snippet}

{#if !hasAssignees && !hasLabels}
	{#if editable}
		<div class="flex flex-wrap items-center gap-1" data-peek-fields>
			{@render assigneePicker()}
			{@render labelPicker()}
		</div>
	{/if}
{:else}
	<div class="grid gap-1.5" data-peek-fields>
		{#if hasAssignees || editable}
			<div class="flex flex-wrap items-center gap-1" aria-label="Assignees" role="group">
				{#each shown.assignees as a (a.login)}
					<GhLink href={profileUrl(a.login, a.bot)} class="{CHIP} no-underline! hover:bg-muted">
						{#if a.avatar}
							<img src={a.avatar} alt="" class="-ml-1 size-4 rounded-full bg-muted" />
						{/if}
						<span class="text-foreground">{a.login}</span>
					</GhLink>
				{/each}
				{#if editable}{@render assigneePicker()}{/if}
			</div>
		{/if}
		{#if hasLabels || editable}
			<div class="flex flex-wrap items-center gap-1" aria-label="Labels" role="group">
				{#each shown.labels as l (l.name)}
					<a
						href={labelUrl(p.repo, l.name)}
						target="_blank"
						rel="noreferrer"
						class={CHIP}
						style="border-color: #{l.color}80; background: #{l.color}1f">{l.name}</a
					>
				{/each}
				{#if editable}{@render labelPicker()}{/if}
			</div>
		{/if}
	</div>
{/if}
