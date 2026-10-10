<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { api } from '$lib/api';
	import { searchIsUnscoped, SOURCE_RESULTS_MAX, type SourceCount } from '$lib/shared/item-views';
	import { splitSearch } from '$lib/shared/query';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	let { query }: { query: string } = $props();

	const TYPING_PAUSE_MS = 600;
	const COUNT_FRESH_MS = 5 * 60_000;

	let settled = $state({ query: '' });
	$effect(() => {
		const next = { query: query.trim() };
		const timer = setTimeout(() => (settled = next), TYPING_PAUSE_MS);
		return () => clearTimeout(timer);
	});

	const count = createQuery(() => ({
		queryKey: ['search-count', settled.query],
		queryFn: () => api.countSearch(settled.query),
		enabled: !!settled.query && !splitSearch(settled.query).errors.length,
		staleTime: COUNT_FRESH_MS,
		retry: false
	}));

	const unscoped = $derived(!!query.trim() && searchIsUnscoped(query));
	const hushWords = $derived(splitSearch(query).hush);
	const fmt = (n: number) => n.toLocaleString();

	function found(c: SourceCount): string {
		const parts = [
			c.pr !== null ? `${fmt(c.pr)} PR${c.pr === 1 ? '' : 's'}` : null,
			c.issue !== null ? `${fmt(c.issue)} issue${c.issue === 1 ? '' : 's'}` : null
		].filter(Boolean);
		return parts.join(' and ');
	}

	const tooMany = $derived(
		!!count.data &&
			((count.data.pr ?? 0) > SOURCE_RESULTS_MAX || (count.data.issue ?? 0) > SOURCE_RESULTS_MAX)
	);
</script>

{#if unscoped}
	<p class="flex items-start gap-1.5 text-xs text-signal-warn" role="status">
		<TriangleAlert class="mt-px size-3.5 shrink-0" />
		<span
			>This searches all of GitHub. Add a person, team, repository, or organization, or Hush keeps
			only the {SOURCE_RESULTS_MAX} most recently updated results from anywhere.</span
		>
	</p>
{/if}
{#if settled.query}
	{#if count.isPending}
		<p class="text-xs text-muted-foreground">Counting what GitHub finds…</p>
	{:else if count.isError}
		<p class="text-xs text-muted-foreground">GitHub could not count this search.</p>
	{:else if count.data && tooMany}
		{#if !unscoped}
			<p class="flex items-start gap-1.5 text-xs text-signal-warn" role="status">
				<TriangleAlert class="mt-px size-3.5 shrink-0" />
				<span
					>GitHub finds {found(count.data)}. Hush keeps the {SOURCE_RESULTS_MAX} most recently updated
					of each.</span
				>
			</p>
		{:else}
			<p class="text-xs text-muted-foreground">GitHub finds {found(count.data)}.</p>
		{/if}
	{:else if count.data}
		<p class="text-xs text-muted-foreground">GitHub finds {found(count.data)} now.</p>
	{/if}
{/if}
{#if hushWords}
	<p class="text-xs text-muted-foreground">
		Then Hush keeps the results that match <code class="font-mono">{hushWords}</code>.
	</p>
{/if}
