<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { meQuery } from '$lib/queries';
	import { saveSettings } from '$lib/save-settings';
	import {
		COMMAND,
		COMMANDS,
		SCOPE_LABEL,
		bindings,
		chordOf,
		conflicts,
		keyText,
		type KeyCommand,
		type KeyScope
	} from '$lib/shared/keymap';
	import { isMac } from '$lib/keys.svelte';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Card from '$lib/components/ui/card';
	import Search from '@lucide/svelte/icons/search';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	/**
	 * Every keyboard shortcut, editable (the table: shared/keymap.ts). A change is saved at once as
	 * the `keys` setting, and only what differs from the defaults is kept.
	 */
	const me = createQuery(meQuery);
	const changes = $derived(me.data?.settings.keys ?? {});
	const map = $derived(bindings(changes));
	const MAX_KEYS = 4;

	let search = $state('');
	let capturing = $state<string | null>(null);
	/** A new key that another command already has: replace it there, or cancel. */
	let clash = $state<{ id: string; chord: string; with: KeyCommand[] } | null>(null);

	const same = (a: string[], b: string[]) => a.length === b.length && a.every((k, i) => k === b[i]);
	const text = (k: string) => keyText(k, isMac);

	function save(next: Record<string, string[]>) {
		// Keep only what differs from the defaults.
		const clean = Object.fromEntries(
			Object.entries(next).filter(([id, keys]) => !same(keys, COMMAND.get(id)?.keys ?? []))
		);
		saveSettings({ keys: clean }, 'Shortcut saved');
	}
	const setKeys = (id: string, keys: string[]) => save({ ...changes, [id]: keys });

	function add(id: string, chord: string) {
		const now = map.get(id) ?? [];
		if (now.includes(chord)) return;
		const others = conflicts(map, id, chord);
		if (others.length) clash = { id, chord, with: others };
		else setKeys(id, [...now, chord]);
	}
	function replace() {
		if (!clash) return;
		const next = { ...changes };
		for (const c of clash.with)
			next[c.id] = (map.get(c.id) ?? []).filter((k) => k !== clash!.chord);
		next[clash.id] = [...(map.get(clash.id) ?? []), clash.chord];
		save(next);
		clash = null;
	}

	// While you set a key, the page takes every key press first (also ⌘ K and Esc).
	$effect(() => {
		const id = capturing;
		if (!id) return;
		const onKey = (e: KeyboardEvent) => {
			e.preventDefault();
			e.stopImmediatePropagation();
			if (e.key === 'Escape' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
				capturing = null;
				return;
			}
			const chord = chordOf(e);
			if (!chord) return;
			capturing = null;
			add(id, chord);
		};
		window.addEventListener('keydown', onKey, { capture: true });
		return () => window.removeEventListener('keydown', onKey, { capture: true });
	});

	const groups = $derived.by(() => {
		const q = search.trim().toLowerCase();
		const hit = (c: KeyCommand) =>
			!q ||
			c.label.toLowerCase().includes(q) ||
			c.id.toLowerCase().includes(q) ||
			(map.get(c.id) ?? []).some((k) => text(k).toLowerCase().includes(q) || k.toLowerCase() === q);
		return (Object.keys(SCOPE_LABEL) as KeyScope[])
			.map((scope) => ({ scope, items: COMMANDS.filter((c) => c.scope === scope && hit(c)) }))
			.filter((g) => g.items.length);
	});
	const changed = $derived(Object.keys(changes).length);
</script>

<svelte:head><title>Keyboard shortcuts · Settings · Hush</title></svelte:head>

<div class="grid gap-6">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-lg font-semibold tracking-tight">Keyboard shortcuts</h1>
			<p class="text-sm text-muted-foreground">
				Every shortcut in Hush. Changes are saved at once and follow you to every device.
			</p>
		</div>
		{#if changed}
			<Button variant="ghost" size="sm" onclick={() => save({})}
				><RotateCcw />Reset all ({changed})</Button
			>
		{/if}
	</div>

	<div class="relative">
		<Search
			class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
		/>
		<Input
			class="h-9 pl-8"
			placeholder="Search shortcuts, or type a key"
			aria-label="Search shortcuts"
			bind:value={search}
		/>
	</div>

	{#if clash}
		<div
			class="flex flex-wrap items-center gap-3 rounded-lg border border-signal-warn/40 bg-signal-warn/5 px-3.5 py-2.5 text-sm"
			role="alert"
		>
			<TriangleAlert class="size-4 shrink-0 text-signal-warn" />
			<span class="min-w-0 flex-1">
				<kbd class="font-sans font-medium">{text(clash.chord)}</kbd> already does
				{clash.with.map((c) => `“${c.label}”`).join(' and ')}.
			</span>
			<Button size="sm" onclick={replace}>Use it for “{COMMAND.get(clash.id)?.label}”</Button>
			<Button size="sm" variant="ghost" onclick={() => (clash = null)}>Cancel</Button>
		</div>
	{/if}

	{#each groups as g (g.scope)}
		<Card.Root>
			<Card.Header><Card.Title>{SCOPE_LABEL[g.scope]}</Card.Title></Card.Header>
			<Card.Content class="divide-y">
				{#each g.items as c (c.id)}
					{@const keys = map.get(c.id) ?? []}
					{@const edited = c.id in changes}
					<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
						<span class="min-w-0 flex-1 text-sm">
							{c.label}
							{#if edited}<span class="ml-1 text-xs text-muted-foreground">(changed)</span>{/if}
						</span>
						<div class="flex flex-wrap items-center gap-1">
							{#each keys as k (k)}
								<span
									class="group inline-flex items-center gap-1 rounded-md border bg-muted/50 py-0.5 pr-1 pl-2 text-xs"
								>
									<kbd class="font-sans">{text(k)}</kbd>
									<button
										type="button"
										class="rounded p-0.5 text-muted-foreground opacity-60 group-hover:opacity-100 hover:bg-background hover:text-foreground"
										aria-label="Remove {text(k)} from {c.label}"
										onclick={() =>
											setKeys(
												c.id,
												keys.filter((x) => x !== k)
											)}><X class="size-3" /></button
									>
								</span>
							{:else}
								<span class="text-xs text-muted-foreground">No key</span>
							{/each}
							{#if capturing === c.id}
								<span
									class="rounded-md border border-dashed border-primary px-2 py-0.5 text-xs text-primary"
									aria-live="polite">Press a key… (Esc cancels)</span
								>
							{:else if keys.length < MAX_KEYS}
								<Button
									variant="ghost"
									size="icon-xs"
									aria-label="Add a key to {c.label}"
									onclick={() => {
										clash = null;
										capturing = c.id;
									}}><Plus /></Button
								>
							{/if}
							<Button
								variant="ghost"
								size="icon-xs"
								class={cn(!edited && 'invisible')}
								aria-label="Reset {c.label}"
								title="Reset to {c.keys.map(text).join(', ') || 'no key'}"
								onclick={() => setKeys(c.id, c.keys)}><RotateCcw /></Button
							>
						</div>
					</div>
				{/each}
			</Card.Content>
		</Card.Root>
	{:else}
		<p class="text-sm text-muted-foreground">No shortcut matches “{search}”.</p>
	{/each}
</div>
