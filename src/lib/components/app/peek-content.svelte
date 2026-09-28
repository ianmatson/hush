<script lang="ts">
	import type { ActionKind } from '$lib/shared/types';
	import PeekBody from './peek-body.svelte';

	/** A PR or issue in the side panel; other threads (releases, CI runs) get a short note. */
	let {
		repo,
		number,
		title,
		need = null
	}: { repo: string; number: number | null; title: string; need?: ActionKind | null } = $props();
</script>

{#if number}
	{#key `${repo}#${number}`}
		<PeekBody {repo} {number} {need} />
	{/key}
{:else}
	<div class="grid gap-2 p-4 text-sm">
		<p class="font-mono text-xs text-muted-foreground">{repo}</p>
		<h2 class="text-base font-semibold">{title}</h2>
		<p class="text-muted-foreground">Hush can show only pull requests and issues.</p>
	</div>
{/if}
