<script lang="ts" module>
	export interface SearchSelectOption {
		value: string;
		label: string;
	}

	export interface SearchSelectGroup {
		heading?: string;
		options: SearchSelectOption[];
	}
</script>

<script lang="ts">
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import { SELECT_TRIGGER_CLASS } from '$lib/components/ui/select/select-trigger.svelte';
	import { optionScore } from '$lib/option-search';
	import { cn } from '$lib/utils';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';

	let {
		value,
		groups,
		onchange,
		label,
		labelledby,
		placeholder = 'Choose…',
		size = 'default',
		class: className
	}: {
		value: string;
		groups: SearchSelectGroup[];
		onchange: (value: string) => void;
		label?: string;
		labelledby?: string;
		placeholder?: string;
		size?: 'sm' | 'default';
		class?: string;
	} = $props();

	let open = $state(false);
	let search = $state('');
	let highlighted = $state('');
	let trigger = $state<HTMLButtonElement | null>(null);
	let content = $state<HTMLElement | null>(null);
	let searchInput = $state<HTMLInputElement | null>(null);

	const shown = $derived(groups.filter((g) => g.options.length));
	const chosen = $derived(shown.flatMap((g) => g.options).find((o) => o.value === value));
	const searchLabel = $derived(`Search ${(label ?? 'options').toLowerCase()}`);

	function setOpen(next: boolean) {
		open = next;
		search = '';
		highlighted = value;
	}

	function choose(next: string) {
		setOpen(false);
		if (next !== value) onchange(next);
	}

	function scrollChoiceIntoList() {
		const list = content?.querySelector<HTMLElement>('[data-slot=command-list]');
		const item = list?.querySelector<HTMLElement>('[data-slot=command-item][data-selected]');
		if (!list || !item) return;
		const itemTop = item.getBoundingClientRect().top - list.getBoundingClientRect().top;
		list.scrollTop += itemTop - (list.clientHeight - item.offsetHeight) / 2;
	}

	function focusSearchAndShowChoice(e: Event) {
		e.preventDefault();
		searchInput?.focus({ preventScroll: true });
		requestAnimationFrame(scrollChoiceIntoList);
	}

	function closeOnTab(e: KeyboardEvent) {
		if (e.key !== 'Tab') return;
		e.preventDefault();
		setOpen(false);
	}

	function focusTriggerUnlessMoved(e: Event) {
		e.preventDefault();
		const focused = document.activeElement;
		const movedElsewhere = !!focused && focused !== document.body && !content?.contains(focused);
		if (!movedElsewhere) trigger?.focus();
	}
</script>

<Popover.Root bind:open={() => open, setOpen}>
	<Popover.Trigger
		bind:ref={trigger}
		data-slot="select-trigger"
		data-size={size}
		data-placeholder={chosen ? undefined : ''}
		aria-label={label}
		aria-labelledby={labelledby}
		class={cn(SELECT_TRIGGER_CLASS, className)}
	>
		<span class="truncate">{chosen?.label ?? placeholder}</span>
		<ChevronDownIcon class="pointer-events-none size-4 text-muted-foreground" />
	</Popover.Trigger>
	<Popover.Content
		bind:ref={content}
		align="start"
		onOpenAutoFocus={focusSearchAndShowChoice}
		onCloseAutoFocus={focusTriggerUnlessMoved}
		trapFocus={false}
		onkeydown={closeOnTab}
		class="w-(--bits-popover-anchor-width) min-w-56 gap-0 p-0"
	>
		<Command.Root
			bind:value={highlighted}
			label={label ?? searchLabel}
			filter={optionScore}
			disableInitialScroll
		>
			<Command.Input
				bind:ref={searchInput}
				bind:value={search}
				placeholder="Search…"
				aria-label={searchLabel}
			/>
			<Command.List class="max-h-72">
				<Command.Empty class="py-4 text-muted-foreground">Nothing matches “{search}”.</Command.Empty
				>
				{#each shown as g, k (g.heading ?? k)}
					<Command.Group heading={g.heading} value={g.heading ?? `group-${k}`}>
						{#each g.options as o (o.value)}
							<Command.Item
								value={o.value}
								keywords={[o.label]}
								data-checked={o.value === value}
								onSelect={() => choose(o.value)}
							>
								<span class="truncate">{o.label}</span>
							</Command.Item>
						{/each}
					</Command.Group>
				{/each}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
