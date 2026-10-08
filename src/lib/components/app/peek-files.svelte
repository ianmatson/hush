<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { pullFilesQuery } from '$lib/queries';
	import { fileAnchor, splitPath } from '$lib/shared/diff';
	import { FILES_TAB, itemPagePath } from '$lib/shared/item-page';
	import { cn } from '$lib/utils';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	let {
		repo,
		number,
		head,
		changedFiles
	}: { repo: string; number: number; head: string; changedFiles: number } = $props();

	let open = $state(false);
	const q = createQuery(() => ({
		...pullFilesQuery(repo, number, head, changedFiles),
		enabled: open
	}));
	const filesPath = $derived(`${itemPagePath(repo, number, 'pr')}/${FILES_TAB}`);
</script>

<div class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5 border-t pt-3">
	<div class="flex items-center gap-1 text-xs">
		<button
			type="button"
			class="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
			aria-expanded={open}
			onclick={() => (open = !open)}
		>
			<ChevronRight class={cn('size-3.5 transition-transform', open && 'rotate-90')} />
			Files
			<span class="font-normal tabular-nums">{changedFiles}</span>
		</button>
		<a
			href={filesPath}
			class="ml-auto text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
			>See the changes</a
		>
	</div>
	{#if open}
		{#if q.isPending}
			<Skeleton class="h-4 w-3/4" />
			<Skeleton class="h-4 w-2/3" />
		{:else if q.isError}
			<p class="text-muted-foreground">Hush cannot list the files: {q.error.message}</p>
		{:else}
			<ul class="grid grid-cols-[minmax(0,1fr)]">
				{#each q.data ?? [] as file (file.filename)}
					{@const path = splitPath(file.filename)}
					<li>
						<a
							href="{filesPath}#{fileAnchor(file.filename)}"
							class="-mx-1 flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted"
							title={file.filename}
						>
							<span class="flex min-w-0 flex-1 font-mono text-xs"
								><span class="min-w-0 truncate text-muted-foreground">{path.directory}</span><span
									class="max-w-full shrink-0 truncate">{path.name}</span
								></span
							>
							<span class="shrink-0 text-xs text-signal-merge tabular-nums">+{file.additions}</span>
							<span class="shrink-0 text-xs text-signal-fail tabular-nums">−{file.deletions}</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>
