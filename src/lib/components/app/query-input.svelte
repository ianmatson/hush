<script lang="ts">
	import { untrack } from 'svelte';
	import type { RuleMatch } from '$lib/shared/types';
	import { formatQuery, parseQuery } from '$lib/shared/query';
	import { Input } from '$lib/components/ui/input';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	/**
	 * The conditions as one line of text, in the query language (shared/query.ts). Edits apply
	 * when the text has no errors; changes from the visual editor show here at once.
	 */
	let {
		when = $bindable(),
		id,
		label = 'As text',
		placeholder = 'repo:acme/* kind:review -is:bot'
	}: { when: RuleMatch; id: string; label?: string; placeholder?: string } = $props();

	let text = $state(formatQuery(when ?? {}));
	let errors = $state<string[]>([]);
	const same = (a: RuleMatch, b: RuleMatch) => JSON.stringify(a) === JSON.stringify(b);

	// The visual editor changed the conditions: show them (unless the text already says that).
	$effect(() => {
		const w = when ?? {};
		untrack(() => {
			if (!same(parseQuery(text).when, w)) {
				text = formatQuery(w);
				errors = [];
			}
		});
	});

	function oninput(value: string) {
		text = value;
		const parsed = parseQuery(value);
		errors = parsed.errors;
		if (!parsed.errors.length && !same(parsed.when, when ?? {})) when = parsed.when;
	}
</script>

<div class="grid gap-1">
	<label for={id} class="text-xs font-medium text-muted-foreground">{label}</label>
	<Input
		{id}
		class="h-8 font-mono text-xs"
		{placeholder}
		spellcheck={false}
		autocomplete="off"
		value={text}
		oninput={(e) => oninput(e.currentTarget.value)}
		aria-invalid={errors.length > 0}
	/>
	{#each errors as e (e)}
		<p class="flex items-center gap-1.5 text-xs text-destructive">
			<TriangleAlert class="size-3.5 shrink-0" />{e}
		</p>
	{/each}
</div>
