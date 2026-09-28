<script lang="ts">
	import { parseQuery } from '$lib/shared/query';
	import { Input } from '$lib/components/ui/input';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import QuerySuggest from './query-suggest.svelte';

	/**
	 * A query in the query language (shared/query.ts), with suggestions while you type and the
	 * first error under it. Rules and saved searches store this text itself.
	 */
	let {
		value = $bindable(''),
		id,
		label,
		placeholder = 'repo:acme/* needs:review -author:bots',
		ref = $bindable(null),
		class: className = 'h-8 font-mono text-xs'
	}: {
		value: string;
		id: string;
		label?: string;
		placeholder?: string;
		ref?: HTMLInputElement | null;
		class?: string;
	} = $props();

	const errors = $derived(parseQuery(value).errors);
</script>

<div class="grid gap-1">
	{#if label}<label for={id} class="text-xs font-medium text-muted-foreground">{label}</label>{/if}
	<div class="relative">
		<Input
			{id}
			bind:ref
			class={className}
			{placeholder}
			spellcheck={false}
			autocomplete="off"
			bind:value
			aria-invalid={errors.length > 0}
		/>
		<QuerySuggest input={ref} {value} onpick={(next) => (value = next)} />
	</div>
	{#if errors[0]}
		<p class="flex items-center gap-1.5 text-xs text-destructive">
			<TriangleAlert class="size-3.5 shrink-0" />{errors[0]}
		</p>
	{/if}
</div>
