<script lang="ts">
	import { parseExpr } from '$lib/shared/query';
	import { Input } from '$lib/components/ui/input';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import QuerySuggest from './query-suggest.svelte';

	/**
	 * A query as one line of text (shared/query.ts): the form rules and views store. The parts
	 * that Hush does not understand show as errors, and the settings refuse to save them.
	 */
	let {
		value = $bindable(''),
		id,
		label = 'As text',
		placeholder = 'repo:acme/* label:bug -author:bots'
	}: { value: string; id: string; label?: string; placeholder?: string } = $props();

	let el = $state<HTMLInputElement | null>(null);
	const errors = $derived(parseExpr(value ?? '').errors);
	const oninput = (v: string) => (value = v);
</script>

<div class="grid gap-1">
	<label for={id} class="text-xs font-medium text-muted-foreground">{label}</label>
	<div class="relative">
		<Input
			{id}
			bind:ref={el}
			class="h-8 font-mono text-xs"
			{placeholder}
			spellcheck={false}
			autocomplete="off"
			value={value ?? ''}
			oninput={(e) => oninput(e.currentTarget.value)}
			aria-invalid={errors.length > 0}
		/>
		<QuerySuggest input={el} value={value ?? ''} onpick={oninput} />
	</div>
	{#each errors as e (e)}
		<p class="flex items-center gap-1.5 text-xs text-destructive">
			<TriangleAlert class="size-3.5 shrink-0" />{e}
		</p>
	{/each}
</div>
