<script lang="ts">
	import PeekBody from './peek-body.svelte';
	import PeekThread from './peek-thread.svelte';

	/** A PR or issue in the side panel, or another thread (a workflow run, a release, a commit…). */
	let {
		repo,
		number,
		thread = null,
		title
	}: { repo: string; number: number | null; thread?: string | null; title: string } = $props();
</script>

{#if number}
	{#key `${repo}#${number}`}
		<PeekBody {repo} {number} />
	{/key}
{:else if thread}
	{#key thread}
		<PeekThread id={thread} {repo} {title} />
	{/key}
{:else}
	<div class="grid gap-2 p-4 text-sm">
		<p class="font-mono text-xs text-muted-foreground">{repo}</p>
		<h2 class="text-base font-semibold">{title}</h2>
		<p class="text-muted-foreground">Hush has nothing more to show about this.</p>
	</div>
{/if}
