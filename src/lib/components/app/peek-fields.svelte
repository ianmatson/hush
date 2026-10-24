<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { projectsQuery } from '$lib/queries';
	import { canEditFields, itemFieldEditor, shownFields } from '$lib/item-field-editor.svelte';
	import { MAX_ASSIGNEES } from '$lib/shared/item-fields';
	import { profileUrl } from '$lib/shared/github-links';
	import type { PeekDTO } from '$lib/shared/types';
	import * as Popover from '$lib/components/ui/popover';
	import ItemFieldPicker from './item-field-picker.svelte';
	import PeekProjects from './peek-projects.svelte';
	import PeekLabels from './peek-labels.svelte';
	import GhLink from './gh-link.svelte';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import { slideChildren } from '$lib/slide-children';
	import { EMPTY_FIELD_BADGE } from './field-badge';

	let { p }: { p: PeekDTO } = $props();

	const STACKED_AVATARS = 3;
	const STACK =
		'flex h-6 min-w-0 items-center gap-1.5 rounded-full pr-2 pl-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none data-[state=open]:bg-muted';

	const projects = createQuery(() => projectsQuery(p.repo, p.number));
	const editor = itemFieldEditor(() => p, 'assignees');
	const editable = $derived(canEditFields(p));
	const assignees = $derived(shownFields(p).assignees);
	const labels = $derived(shownFields(p).labels);
	const stacked = $derived(assignees.slice(0, STACKED_AVATARS));
	const summary = $derived(
		assignees.length ? `Assignees: ${assignees.map((a) => a.login).join(', ')}` : 'No assignees'
	);
	const showsProjects = $derived(
		projects.isPending ||
			projects.isError ||
			!!projects.data?.items.length ||
			projects.data?.access === 'edit'
	);
	const showsAssignees = $derived(editable || assignees.length > 0);
	const showsLabels = $derived(editable || labels.length > 0);
</script>

{#snippet divider()}
	<span class="mx-1 h-4 w-px shrink-0 bg-border"></span>
{/snippet}

{#snippet stack()}
	{#if stacked.length}
		<span class="flex shrink-0 -space-x-1.5">
			{#each stacked as a (a.login)}
				{#if a.avatar}
					<img
						src={a.avatar}
						alt=""
						class="size-[1.125rem] rounded-full bg-muted ring-2 ring-background"
					/>
				{:else}
					<span class="size-[1.125rem] rounded-full bg-muted ring-2 ring-background"></span>
				{/if}
			{/each}
		</span>
		<span class="hidden max-w-20 truncate text-foreground @xs:inline @md:max-w-32">
			{assignees.length === 1 ? assignees[0].login : `${assignees.length} people`}
		</span>
	{:else}
		<UserPlus class="size-3.5" />Assignee
	{/if}
{/snippet}

{#if showsProjects || showsAssignees || showsLabels}
	<div class="@container">
		<div
			class="flex h-10 items-center gap-1 border-y text-xs"
			role="group"
			aria-label="Project status, assignees, and labels"
			{@attach slideChildren}
		>
			{#if showsProjects}
				<div class="flex max-w-[45%] min-w-0 items-center">
					<PeekProjects repo={p.repo} number={p.number} />
				</div>
			{/if}

			{#if showsProjects && showsAssignees}
				{@render divider()}
			{/if}

			{#if showsAssignees}
				<div class="flex min-w-0 shrink-0 items-center">
					{#if editable}
						<ItemFieldPicker
							label="Assignees"
							tip={assignees.length ? 'Assignees' : 'Assign someone'}
							options={editor.options}
							selected={editor.chosen}
							loading={editor.loading}
							error={editor.error}
							full={assignees.length >= MAX_ASSIGNEES}
							fullReason="GitHub allows up to {MAX_ASSIGNEES} assignees."
							bind:search={editor.search}
							bind:open={editor.open}
							ontoggle={editor.toggle}
							triggerClass={assignees.length ? STACK : EMPTY_FIELD_BADGE}
							triggerLabel={summary}
						>
							{#snippet trigger()}{@render stack()}{/snippet}
						</ItemFieldPicker>
					{:else if assignees.length}
						<Popover.Root>
							<Popover.Trigger class={STACK} aria-label={summary}>{@render stack()}</Popover.Trigger
							>
							<Popover.Content align="start" class="grid w-60 gap-1 p-2 text-sm">
								<p class="px-1 pb-1 text-xs font-medium text-muted-foreground">Assignees</p>
								{#each assignees as a (a.login)}
									<GhLink
										href={profileUrl(a.login, a.bot)}
										class="flex items-center gap-2 rounded-md px-1 py-1 no-underline! hover:bg-muted"
									>
										{#if a.avatar}<img
												src={a.avatar}
												alt=""
												class="size-5 rounded-full bg-muted"
											/>{/if}
										<span class="truncate">{a.login}</span>
									</GhLink>
								{/each}
							</Popover.Content>
						</Popover.Root>
					{/if}
				</div>
			{/if}

			{#if showsLabels}
				{#if showsProjects || showsAssignees}
					{@render divider()}
				{/if}
				<div class="min-w-0 flex-1">
					<PeekLabels {p} />
				</div>
			{/if}
		</div>
	</div>
{/if}
