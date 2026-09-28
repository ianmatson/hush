<script lang="ts">
	import { suggest, type Suggestion } from '$lib/shared/query';
	import { cn } from '$lib/utils';

	/**
	 * Suggestions for the query language under an input: the words ("ne" → needs:) and their
	 * values ("needs:" → review, fix-ci…), each with what it means. ↑/↓ move, Enter or Tab picks,
	 * Esc closes. The parent must be `relative`; it gets `value` back through `onpick`.
	 */
	let {
		input,
		value,
		onpick
	}: {
		input: HTMLInputElement | null;
		value: string;
		onpick: (next: string) => void;
	} = $props();

	let open = $state(false);
	let caret = $state(0);
	let active = $state(0);
	const found = $derived(
		open ? suggest(value, caret) : { from: 0, to: 0, items: [] as Suggestion[] }
	);
	const items = $derived(found.items.slice(0, 8));

	function pick(s: Suggestion) {
		const next = value.slice(0, found.from) + s.insert + value.slice(found.to);
		const at = found.from + s.insert.length;
		onpick(next);
		requestAnimationFrame(() => {
			input?.focus();
			input?.setSelectionRange(at, at);
			caret = at;
			active = 0;
		});
	}

	$effect(() => {
		const el = input;
		if (!el) return;
		const update = () => {
			caret = el.selectionStart ?? el.value.length;
			active = 0;
		};
		const onFocus = () => {
			open = true;
			update();
		};
		const onBlur = () => setTimeout(() => (open = false), 120);
		const onKey = (e: KeyboardEvent) => {
			if (!open || !items.length) return;
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				e.preventDefault();
				active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
			} else if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
				e.preventDefault();
				pick(items[active]);
			} else if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				open = false;
			}
		};
		const onInput = () => {
			open = true;
			update();
		};
		el.addEventListener('focus', onFocus);
		el.addEventListener('blur', onBlur);
		el.addEventListener('keydown', onKey);
		el.addEventListener('input', onInput);
		// Moving the caret with ← / → changes which word the suggestions are for.
		const onKeyUp = (e: KeyboardEvent) => {
			if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End')
				update();
		};
		el.addEventListener('click', update);
		el.addEventListener('keyup', onKeyUp);
		return () => {
			el.removeEventListener('keyup', onKeyUp);
			el.removeEventListener('focus', onFocus);
			el.removeEventListener('blur', onBlur);
			el.removeEventListener('keydown', onKey);
			el.removeEventListener('input', onInput);
			el.removeEventListener('click', update);
		};
	});
</script>

{#if open && items.length}
	<ul
		class="absolute top-full left-0 z-20 mt-1 grid w-max max-w-[min(26rem,90vw)] min-w-full gap-0.5 rounded-md border bg-popover p-1 text-xs text-popover-foreground shadow-md"
		role="listbox"
		aria-label="Suggestions"
	>
		{#each items as s, k (s.label)}
			<li role="option" aria-selected={k === active}>
				<button
					type="button"
					class={cn(
						'flex w-full items-baseline gap-2 rounded px-2 py-1 text-left hover:bg-muted',
						k === active && 'bg-muted'
					)}
					onmousedown={(e) => e.preventDefault()}
					onclick={() => pick(s)}
				>
					<span class="font-mono font-medium">{s.label}</span>
					{#if s.help}<span class="truncate text-muted-foreground">{s.help}</span>{/if}
				</button>
			</li>
		{/each}
	</ul>
{/if}
