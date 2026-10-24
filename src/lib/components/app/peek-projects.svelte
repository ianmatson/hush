<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { keys, projectsQuery, queryClient, refetchUnlessLive } from '$lib/queries';
	import { MARK_DOT } from '$lib/marks';
	import { cn } from '$lib/utils';
	import {
		statusColor,
		statusOf,
		type ProjectEdit,
		type ProjectItemDTO,
		type ProjectStatusOption
	} from '$lib/shared/projects';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import SquareKanban from '@lucide/svelte/icons/square-kanban';
	import Tip from './tip.svelte';
	import { EMPTY_FIELD_BADGE, FIELD_BADGE } from './field-badge';

	let { repo, number }: { repo: string; number: number } = $props();

	const NO_STATUS = 'none';
	const q = createQuery(() => projectsQuery(repo, number));
	const editable = $derived(q.data?.access === 'edit');
	const items = $derived(q.data?.items ?? []);
	const first = $derived(items[0]);
	const firstStatus = $derived(first ? statusOf(first.status) : null);

	let open = $state(false);
	let search = $state('');
	let openItemId = $state<string | null>(null);
	let saving = $state(false);
	let searchInput = $state<HTMLInputElement | null>(null);

	const openItem = $derived(items.find((i) => i.id === openItemId) ?? null);
	const words = $derived(search.trim().toLowerCase());
	const matches = (text: string) => !words || text.toLowerCase().includes(words);
	const shownItems = $derived(items.filter((i) => matches(i.project.title)));
	const shownOthers = $derived(
		editable ? (q.data?.others ?? []).filter((p) => matches(p.title)) : []
	);
	const shownOptions = $derived(
		(openItem?.status?.options ?? []).filter((o: ProjectStatusOption) => matches(o.name))
	);
	const summary = $derived(
		items.map((i) => `${i.project.title}: ${statusOf(i.status)?.name ?? 'No status'}`).join(', ') ||
			'Not in a project'
	);

	function setOpen(next: boolean) {
		open = next;
		if (!next) {
			search = '';
			openItemId = null;
		}
	}

	function show(itemId: string | null) {
		openItemId = itemId;
		search = '';
		searchInput?.focus({ preventScroll: true });
	}

	function backOnEmptySearch(e: KeyboardEvent) {
		if (!openItemId || search) return;
		if (e.key === 'Backspace' || e.key === 'ArrowLeft') {
			e.preventDefault();
			show(null);
		}
	}

	function focusSearch(e: Event) {
		e.preventDefault();
		searchInput?.focus({ preventScroll: true });
	}

	async function edit(change: ProjectEdit, done: string) {
		saving = true;
		try {
			await api.editProject(change);
			toast.success(done);
			await queryClient.invalidateQueries({ queryKey: keys.projects(repo, number) });
			refetchUnlessLive(keys.items);
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			saving = false;
		}
	}

	function setStatus(item: ProjectItemDTO, optionId: string) {
		show(null);
		if (!item.status || optionId === (item.status.optionId ?? NO_STATUS)) return;
		const option = item.status.options.find((o) => o.id === optionId);
		void edit(
			{
				action: 'status',
				projectId: item.project.id,
				itemId: item.id,
				fieldId: item.status.fieldId,
				optionId: option ? option.id : null
			},
			`${item.project.title}: ${option?.name ?? 'No status'}`
		);
	}

	function add(projectId: string) {
		const target = q.data?.others.find((p) => p.id === projectId);
		if (!target || !q.data?.contentId) return;
		search = '';
		void edit(
			{ action: 'add', projectId: target.id, contentId: q.data.contentId },
			`Added to ${target.title}`
		);
	}

	function remove(item: ProjectItemDTO) {
		if (!confirm(`Remove from ${item.project.title}? Its fields on the project are lost.`)) return;
		show(null);
		void edit(
			{ action: 'remove', projectId: item.project.id, itemId: item.id },
			`Removed from ${item.project.title}`
		);
	}
</script>

{#snippet dot(option: ProjectStatusOption | null, size = 'size-2')}
	<span
		class={cn(
			size,
			'shrink-0 rounded-full',
			option ? MARK_DOT[statusColor(option.color)] : 'border border-muted-foreground'
		)}
	></span>
{/snippet}

{#if q.isPending}
	<Skeleton class="h-6 w-20 shrink-0 rounded-full" />
{:else if q.isError && !q.data}
	<Tip text="Hush could not load the projects">
		{#snippet children(props)}
			<button
				{...props}
				type="button"
				class={EMPTY_FIELD_BADGE}
				disabled={q.isFetching}
				onclick={() => q.refetch()}
			>
				<SquareKanban class="size-3.5" />{q.isFetching ? 'Loading…' : 'Retry'}
			</button>
		{/snippet}
	</Tip>
{:else if items.length || editable}
	<Popover.Root bind:open={() => open, setOpen}>
		<Tip text={items.length ? 'Projects' : 'Add to a project'}>
			{#snippet children(props)}
				<Popover.Trigger
					{...props}
					class={items.length ? cn(FIELD_BADGE, 'max-w-full') : EMPTY_FIELD_BADGE}
					aria-label={items.length ? `Projects: ${summary}` : 'Add to a project'}
				>
					{#if first}
						{@render dot(firstStatus)}
						<span class="truncate">{firstStatus?.name ?? 'No status'}</span>
						{#if items.length > 1}
							<span class="shrink-0 font-normal text-muted-foreground">+{items.length - 1}</span>
						{/if}
					{:else}
						<SquareKanban class="size-3.5" />Project
					{/if}
				</Popover.Trigger>
			{/snippet}
		</Tip>
		<Popover.Content
			align="start"
			onOpenAutoFocus={focusSearch}
			class="w-72 gap-0 p-0"
			data-project-picker
		>
			<Command.Root label="Projects" shouldFilter={false} disableInitialScroll>
				{#if openItem}
					<div class="flex items-center gap-1 border-b px-1 py-1 text-sm">
						<button
							type="button"
							class="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
							aria-label="All projects"
							onclick={() => show(null)}><ChevronLeft class="size-4" /></button
						>
						<span class="truncate font-medium">{openItem.project.title}</span>
						<a
							href={openItem.project.url}
							target="_blank"
							rel="noreferrer"
							class="ml-auto flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
							aria-label="Open {openItem.project.title} on GitHub"
							><ExternalLink class="size-3.5" /></a
						>
					</div>
				{/if}
				<Command.Input
					bind:ref={searchInput}
					bind:value={search}
					onkeydown={backOnEmptySearch}
					placeholder={openItem ? 'Set status…' : 'Search projects…'}
					aria-label={openItem ? 'Search statuses' : 'Search projects'}
				/>
				<Command.List class="max-h-72">
					{#if openItem}
						{@const current = openItem.status?.optionId ?? NO_STATUS}
						{#if openItem.status}
							<Command.Group heading="Status" value="status">
								{#if matches('No status')}
									<Command.Item
										value={NO_STATUS}
										data-checked={current === NO_STATUS}
										disabled={!editable || saving}
										onSelect={() => setStatus(openItem, NO_STATUS)}
									>
										{@render dot(null)}No status
									</Command.Item>
								{/if}
								{#each shownOptions as o (o.id)}
									<Command.Item
										value={o.id}
										data-checked={current === o.id}
										disabled={!editable || saving}
										onSelect={() => setStatus(openItem, o.id)}
									>
										{@render dot(o)}<span class="truncate">{o.name}</span>
									</Command.Item>
								{/each}
							</Command.Group>
						{:else}
							<p class="px-3 py-4 text-center text-sm text-muted-foreground">
								This project has no Status field.
							</p>
						{/if}
						{#if editable}
							<Command.Group value="actions" class="border-t">
								<Command.Item
									value="remove"
									class="text-destructive data-selected:text-destructive"
									disabled={saving}
									onSelect={() => remove(openItem)}>Remove from project</Command.Item
								>
							</Command.Group>
						{/if}
					{:else}
						{#if shownItems.length}
							<Command.Group heading="In projects" value="in">
								{#each shownItems as item (item.id)}
									{@const status = statusOf(item.status)}
									<Command.Item value={item.id} onSelect={() => show(item.id)}>
										<span class="truncate">{item.project.title}</span>
										<span
											class="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
										>
											{@render dot(status)}{status?.name ?? 'No status'}
										</span>
										<ChevronRight class="text-muted-foreground" />
									</Command.Item>
								{/each}
							</Command.Group>
						{/if}
						{#if shownOthers.length}
							<Command.Group heading="Add to a project" value="others">
								{#each shownOthers as other (other.id)}
									<Command.Item value={other.id} disabled={saving} onSelect={() => add(other.id)}>
										<SquareKanban class="text-muted-foreground" />
										<span class="truncate">{other.title}</span>
									</Command.Item>
								{/each}
							</Command.Group>
						{/if}
						{#if !shownItems.length && !shownOthers.length}
							<p class="px-2 py-4 text-center text-sm text-muted-foreground">
								{words ? `Nothing matches “${search.trim()}”.` : 'No projects to add.'}
							</p>
						{/if}
					{/if}
				</Command.List>
				{#if !editable}
					<p class="border-t px-3 py-2 text-xs text-muted-foreground">
						Your token can read these projects but cannot change them. See
						<a class="underline underline-offset-2" href="/settings/general#token">GitHub access</a
						>.
					</p>
				{/if}
			</Command.Root>
		</Popover.Content>
	</Popover.Root>
{/if}
