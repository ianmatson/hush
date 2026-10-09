<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import { LUCIDE_COMPONENTS, loadLucide } from '$lib/mark-icon-components';

	let {
		id,
		class: className,
		fallback
	}: { id: string; class?: string; fallback?: Snippet } = $props();

	let lazy = $state<{ id: string; icon: Component | null } | null>(null);
	const Icon = $derived(LUCIDE_COMPONENTS[id] ?? (lazy?.id === id ? lazy.icon : null));

	$effect(() => {
		const wanted = id;
		if (LUCIDE_COMPONENTS[wanted]) return;
		void loadLucide(wanted).then((icon) => {
			if (id === wanted) lazy = { id: wanted, icon };
		});
	});
</script>

{#if Icon}
	<Icon class={className} aria-hidden="true" />
{:else if fallback}
	{@render fallback()}
{/if}
