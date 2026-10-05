<script lang="ts">
	import { cn } from '$lib/utils';
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

	const SEPARATOR = /[,\n]/;
	const MAX_SHOWN = 8;
	const listId = `chips-${Math.random().toString(36).slice(2, 8)}`;

	let draft = $state('');
	let open = $state(false);
	const NONE = -1;
	let active = $state(NONE);

	const matches = $derived.by(() => {
		const typed = draft.trim().toLowerCase();
		const left = suggestions.filter((s) => !values.includes(s));
		const starts = left.filter((s) => s.toLowerCase().startsWith(typed));
		const contains = typed
			? left.filter((s) => !starts.includes(s) && s.toLowerCase().includes(typed))
			: [];
		return [...starts, ...contains].slice(0, MAX_SHOWN);
	});
	const showList = $derived(open && matches.length > 0);

	function add(raw: string) {
		const fresh = raw
			.split(SEPARATOR)
			.map((v) => v.trim())
			.filter((v) => v && !values.includes(v));
		if (fresh.length) onchange([...values, ...fresh]);
		draft = '';
		active = NONE;
	}

	function onkeydown(e: KeyboardEvent) {
		if (showList && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
			e.preventDefault();
			const step = e.key === 'ArrowDown' ? 1 : -1;
			const from = active === NONE && step < 0 ? 0 : active;
			active = (from + step + matches.length) % matches.length;
		} else if (showList && e.key === 'Escape') {
			e.preventDefault();
			open = false;
		} else if (e.key === 'Tab' && showList && draft.trim()) {
			e.preventDefault();
			add(matches[active === NONE ? 0 : active]);
		} else if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			add(showList && active !== NONE ? matches[active] : draft);
		} else if (e.key === 'Backspace' && !draft && values.length) {
			onchange(values.slice(0, -1));
		}
	}
</script>

<div
	class="relative flex min-h-7 min-w-0 flex-1 flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-1.5 py-px focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30"
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
		role="combobox"
		aria-expanded={showList}
		aria-controls={listId}
		aria-autocomplete="list"
		bind:value={draft}
		{onkeydown}
		onfocus={() => (open = true)}
		oninput={() => {
			open = true;
			active = NONE;
		}}
		onblur={() => {
			open = false;
			if (draft.trim()) add(draft);
		}}
	/>
	{#if showList}
		<ul
			id={listId}
			class="absolute top-full left-0 z-20 mt-1 grid max-h-64 w-full min-w-48 gap-0.5 overflow-y-auto rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md"
			role="listbox"
			aria-label="Suggestions for {label}"
		>
			{#each matches as s, k (s)}
				<li role="option" aria-selected={k === active}>
					<button
						type="button"
						class={cn(
							'w-full truncate rounded px-2 py-1 text-left',
							k === active && 'bg-accent text-accent-foreground'
						)}
						onmousedown={(e) => e.preventDefault()}
						onmouseenter={() => (active = k)}
						onclick={() => add(s)}>{s}</button
					>
				</li>
			{/each}
		</ul>
	{/if}
</div>
