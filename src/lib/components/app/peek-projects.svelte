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
		type ProjectItemDTO
	} from '$lib/shared/projects';
	import * as Popover from '$lib/components/ui/popover';
	import * as Select from '$lib/components/ui/select';
	import { Button } from '$lib/components/ui/button';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import SquareKanban from '@lucide/svelte/icons/square-kanban';

	let { repo, number }: { repo: string; number: number } = $props();

	const q = createQuery(() => projectsQuery(repo, number));
	const editable = $derived(q.data?.access === 'edit');
	const NO_STATUS = 'none';
	let saving = $state(false);

	async function edit(change: ProjectEdit, done: string) {
		saving = true;
		try {
			await api.editProject(change);
			toast.success(done);
			await queryClient.invalidateQueries({ queryKey: keys.projects(repo, number) });
			refetchUnlessLive(keys.dashAll);
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			saving = false;
		}
	}

	function setStatus(item: ProjectItemDTO, optionId: string) {
		if (!item.status || optionId === (item.status.optionId ?? NO_STATUS)) return;
		const option = item.status.options.find((o) => o.id === optionId);
		edit(
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

	function moveTo(item: ProjectItemDTO, toProjectId: string) {
		const target = q.data?.others.find((p) => p.id === toProjectId);
		if (!target || !q.data?.contentId) return;
		if (!confirm(`Move to ${target.title}? Its fields on ${item.project.title} are lost.`)) return;
		edit(
			{
				action: 'move',
				projectId: item.project.id,
				itemId: item.id,
				toProjectId: target.id,
				contentId: q.data.contentId
			},
			`Moved to ${target.title}`
		);
	}

	function remove(item: ProjectItemDTO) {
		if (!confirm(`Remove from ${item.project.title}? Its fields on the project are lost.`)) return;
		edit(
			{ action: 'remove', projectId: item.project.id, itemId: item.id },
			`Removed from ${item.project.title}`
		);
	}
</script>

{#each q.data?.items ?? [] as item (item.id)}
	{@const status = statusOf(item.status)}
	<Popover.Root>
		<Popover.Trigger
			class="flex max-w-48 items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium hover:bg-muted"
			aria-label="{item.project.title}: {status?.name ?? 'No status'}"
			title={item.project.title}
		>
			<span
				class={cn(
					'size-2 shrink-0 rounded-full',
					status ? MARK_DOT[statusColor(status.color)] : 'border border-muted-foreground'
				)}
			></span>
			<span class="truncate">{status?.name ?? 'No status'}</span>
		</Popover.Trigger>
		<Popover.Content align="start" class="grid w-72 gap-3 p-3 text-sm">
			<a
				href={item.project.url}
				target="_blank"
				rel="noreferrer"
				class="flex items-center gap-2 font-medium hover:underline"
			>
				<SquareKanban class="size-4 shrink-0 text-muted-foreground" />
				<span class="truncate">{item.project.title}</span>
				<ExternalLink class="ml-auto size-3.5 shrink-0 text-muted-foreground" />
			</a>
			{#if item.status}
				{@const current = item.status.optionId ?? NO_STATUS}
				<div class="grid gap-1.5">
					<span class="text-xs text-muted-foreground">Status</span>
					<Select.Root
						type="single"
						value={current}
						disabled={!editable || saving}
						onValueChange={(v) => setStatus(item, v)}
					>
						<Select.Trigger size="sm" class="w-full" aria-label="Status">
							<span class="flex min-w-0 items-center gap-2">
								<span
									class={cn(
										'size-2 shrink-0 rounded-full',
										status ? MARK_DOT[statusColor(status.color)] : 'border border-muted-foreground'
									)}
								></span>
								<span class="truncate">{status?.name ?? 'No status'}</span>
							</span>
						</Select.Trigger>
						<Select.Content class="max-h-72">
							<Select.Item value={NO_STATUS} label="No status" />
							{#each item.status.options as o (o.id)}
								<Select.Item value={o.id} label={o.name}>
									<span class="flex items-center gap-2">
										<span class={cn('size-2 rounded-full', MARK_DOT[statusColor(o.color)])}></span>
										{o.name}
									</span>
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			{:else}
				<p class="text-xs text-muted-foreground">This project has no Status field.</p>
			{/if}
			{#if editable}
				{#if q.data?.others.length}
					<div class="grid gap-1.5">
						<span class="text-xs text-muted-foreground">Move to another project</span>
						<Select.Root
							type="single"
							value=""
							disabled={saving}
							onValueChange={(v) => moveTo(item, v)}
						>
							<Select.Trigger size="sm" class="w-full" aria-label="Move to another project">
								<span class="truncate text-muted-foreground">Choose a project…</span>
							</Select.Trigger>
							<Select.Content class="max-h-72">
								{#each q.data.others as p (p.id)}
									<Select.Item value={p.id} label={p.title} />
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
				{/if}
				<Button
					variant="ghost"
					size="sm"
					class="justify-self-start text-destructive hover:text-destructive"
					disabled={saving}
					onclick={() => remove(item)}>Remove from project</Button
				>
			{:else}
				<p class="text-xs text-muted-foreground">
					Your token can read this project but cannot change it. See
					<a class="underline underline-offset-2" href="/settings/general#token">GitHub access</a>.
				</p>
			{/if}
		</Popover.Content>
	</Popover.Root>
{/each}
