<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';
	import TextSkeleton from './text-skeleton.svelte';

	let { rows = 1, label }: { rows?: number; label: string } = $props();
</script>

<ul role="status" aria-label={label} class="divide-y rounded-md border">
	{#each Array.from({ length: rows }, (_, index) => index) as row (row)}
		<li class="flex items-center justify-between gap-3 px-3 py-2">
			<span class="grid min-w-0 flex-1">
				<TextSkeleton class="w-2/5" />
				<TextSkeleton class="h-3 w-3/5" />
			</span>
			<Skeleton class="h-7 w-16" />
		</li>
	{/each}
</ul>
