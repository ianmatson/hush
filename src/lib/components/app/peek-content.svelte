<script lang="ts">
	import PeekBody from './peek-body.svelte';

	let { repo, number, title }: { repo: string; number: number | null; title: string } = $props();
</script>

{#if number}
	{#key `${repo}#${number}`}
		<PeekBody {repo} {number} />
	{/key}
{:else}
	<div class="grid gap-2 p-4 text-sm">
		<p class="font-mono text-xs text-muted-foreground">{repo}</p>
		<h2 class="text-base font-semibold">{title}</h2>
		<p class="text-muted-foreground">Hush has nothing more to show about this.</p>
	</div>
{/if}
