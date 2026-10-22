<script lang="ts">
	import { canEditFields, itemFieldEditor, shownFields } from '$lib/item-field-editor.svelte';
	import { MAX_ASSIGNEES } from '$lib/shared/item-fields';
	import { profileUrl } from '$lib/shared/github-links';
	import type { PeekDTO } from '$lib/shared/types';
	import * as Popover from '$lib/components/ui/popover';
	import ItemFieldPicker from './item-field-picker.svelte';
	import GhLink from './gh-link.svelte';
	import UserPlus from '@lucide/svelte/icons/user-plus';

	let { p }: { p: PeekDTO } = $props();

	const PILL =
		'flex max-w-48 items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none data-[state=open]:bg-muted';
	const EMPTY_PILL = `${PILL} border-dashed text-muted-foreground hover:text-foreground`;

	const editor = itemFieldEditor(() => p, 'assignees');
	const assignees = $derived(shownFields(p).assignees);
	const first = $derived(assignees[0]);
	const others = $derived(assignees.length - 1);
	const summary = $derived(
		first ? `Assignees: ${assignees.map((a) => a.login).join(', ')}` : 'No assignees'
	);
</script>

{#snippet pill()}
	{#if first}
		{#if first.avatar}
			<img src={first.avatar} alt="" class="-ml-1 size-4 shrink-0 rounded-full bg-muted" />
		{/if}
		<span class="truncate">{first.login}</span>
		{#if others > 0}<span class="shrink-0 font-normal text-muted-foreground">+{others}</span>{/if}
	{:else}
		<UserPlus class="size-3" />Assign
	{/if}
{/snippet}

{#if canEditFields(p)}
	<ItemFieldPicker
		label="Assignees"
		tip={first ? 'Assignees' : 'Assign someone'}
		options={editor.options}
		selected={editor.chosen}
		loading={editor.loading}
		error={editor.error}
		full={assignees.length >= MAX_ASSIGNEES}
		fullReason="GitHub allows up to {MAX_ASSIGNEES} assignees."
		bind:search={editor.search}
		bind:open={editor.open}
		ontoggle={editor.toggle}
		triggerClass={first ? PILL : EMPTY_PILL}
		triggerLabel={summary}
	>
		{#snippet trigger()}{@render pill()}{/snippet}
	</ItemFieldPicker>
{:else if first}
	<Popover.Root>
		<Popover.Trigger class={PILL} aria-label={summary}>{@render pill()}</Popover.Trigger>
		<Popover.Content align="start" class="grid w-60 gap-1 p-2 text-sm">
			<p class="px-1 pb-1 text-xs font-medium text-muted-foreground">Assignees</p>
			{#each assignees as a (a.login)}
				<GhLink
					href={profileUrl(a.login, a.bot)}
					class="flex items-center gap-2 rounded-md px-1 py-1 no-underline! hover:bg-muted"
				>
					{#if a.avatar}<img src={a.avatar} alt="" class="size-5 rounded-full bg-muted" />{/if}
					<span class="truncate">{a.login}</span>
				</GhLink>
			{/each}
		</Popover.Content>
	</Popover.Root>
{/if}
