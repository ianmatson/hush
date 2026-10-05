<script lang="ts">
	import X from '@lucide/svelte/icons/x';

	let {
		values,
		onchange,
		placeholder = '',
		suggestions = [],
		label
	}: {
		values: string[];
		onchange: (values: string[]) => void;
		placeholder?: string;
		suggestions?: string[];
		label: string;
	} = $props();

	const listId = `chips-${Math.random().toString(36).slice(2, 8)}`;
	let draft = $state('');
	const SEPARATOR = /[,\n]/;

	function add(raw: string) {
		const fresh = raw
			.split(SEPARATOR)
			.map((v) => v.trim())
			.filter((v) => v && !values.includes(v));
		if (fresh.length) onchange([...values, ...fresh]);
		draft = '';
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			add(draft);
		} else if (e.key === 'Backspace' && !draft && values.length) {
			onchange(values.slice(0, -1));
		}
	}
</script>

<div
	class="flex min-h-8 min-w-0 flex-1 flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-1.5 py-1 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30"
>
	{#each values as v (v)}
		<span class="flex items-center gap-0.5 rounded-md bg-muted py-0.5 pr-0.5 pl-1.5 text-xs">
			{v}
			<button
				type="button"
				class="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
				aria-label="Remove {v}"
				onclick={() => onchange(values.filter((x) => x !== v))}><X class="size-3" /></button
			>
		</span>
	{/each}
	<input
		class="h-6 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
		placeholder={values.length ? '' : placeholder}
		aria-label={label}
		list={suggestions.length ? listId : undefined}
		bind:value={draft}
		{onkeydown}
		onblur={() => draft.trim() && add(draft)}
	/>
	{#if suggestions.length}
		<datalist id={listId}>
			{#each suggestions.filter((s) => !values.includes(s)).slice(0, 50) as s (s)}
				<option value={s}></option>
			{/each}
		</datalist>
	{/if}
</div>
