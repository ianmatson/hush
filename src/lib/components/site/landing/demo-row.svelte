<script lang="ts">
	import { buttonClass, cx } from './demo-ui';
	import Check from '@lucide/svelte/icons/check';
	import AlarmClock from '@lucide/svelte/icons/alarm-clock';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import Undo from '@lucide/svelte/icons/undo-2';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import DemoKindIcon from './demo-kind-icon.svelte';
	import type { DemoThread } from './demo-data';

	let {
		thread: t,
		selected,
		onselect,
		ondone,
		onsnooze,
		onmute,
		onrestore,
		onopen
	}: {
		thread: DemoThread;
		selected: boolean;
		onselect: () => void;
		ondone: () => void;
		onsnooze: () => void;
		onmute: () => void;
		onrestore: () => void;
		onopen: () => void;
	} = $props();

	const inInbox = $derived(t.triage === 'inbox' && !t.muted);
	const needsYou = $derived(t.list === 'action' && !t.muted);
	const ref = $derived(t.number ? `${t.repo}#${t.number}` : t.repo);
	const actionTab = $derived(selected ? 0 : -1);
</script>

<div
	data-selected={selected || undefined}
	class={cx(
		'row group relative flex items-start gap-1 rounded-xl border border-transparent px-1 transition-colors',
		'hover:bg-muted/50 data-selected:border-border data-selected:bg-muted/60'
	)}
>
	<button
		type="button"
		class="flex min-w-0 flex-1 items-start gap-3 rounded-lg px-2 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
		aria-current={selected || undefined}
		onclick={onselect}
	>
		<span class="relative block size-8 shrink-0">
			<DemoKindIcon kind={t.kind} subject={t.subject} {needsYou} />
			{#if t.unread}
				<span
					class="absolute top-0 right-0 size-2.5 rounded-full bg-signal-review ring-2 ring-(--row-bg)"
				></span>
				<span class="sr-only">Unread.</span>
			{/if}
		</span>
		<span class="min-w-0 flex-1">
			<span class="flex items-baseline gap-2">
				<span
					class={cx(
						'truncate text-sm',
						t.unread
							? 'font-semibold text-foreground'
							: needsYou
								? 'font-medium'
								: 'text-foreground/80'
					)}>{t.summary}</span
				>
				<span class="shrink-0 text-xs text-muted-foreground tabular-nums">{t.ago}</span>
			</span>
			<span class="mt-0.5 block truncate text-[0.8rem] text-muted-foreground">
				<span class="font-mono text-[0.75rem]">{ref}</span>
				<span class="mx-1 opacity-50">·</span>{t.title}
			</span>
			<span class="mt-1.5 flex flex-wrap items-center gap-1.5 text-[0.7rem] text-muted-foreground">
				{#if t.why}<span class="rounded-md bg-muted px-1.5 py-0.5">{t.why}</span>{/if}
				{#each t.changes ?? [] as change (change.text)}
					<span
						class={cx(
							'rounded-md px-1.5 py-0.5',
							change.tone === 'good'
								? 'bg-signal-merge/10 text-signal-merge'
								: change.tone === 'bad'
									? 'bg-signal-fail/10 text-signal-fail'
									: 'bg-muted'
						)}>{change.text}</span
					>
				{/each}
				{#if t.rule}
					<span class="rounded-md border border-dashed px-1.5 py-0.5">rule: {t.rule}</span>
				{/if}
				{#if t.note}
					<span
						class="flex items-center gap-1 rounded-md bg-signal-merge/10 px-1.5 py-0.5 text-signal-merge"
						><Check class="size-3" />{t.note}</span
					>
				{/if}
				{#if t.triage === 'snoozed' && t.snoozedLabel}
					<span class="rounded-md bg-muted px-1.5 py-0.5">{t.snoozedLabel}</span>
				{/if}
			</span>
		</span>
	</button>

	<div class="flex shrink-0 items-center gap-0.5 self-center pr-2">
		<div
			class="hidden items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-data-selected:opacity-100 focus-within:opacity-100 sm:flex"
		>
			{#if inInbox}
				<button
					type="button"
					class={buttonClass('ghost', 'icon-sm')}
					aria-label="Done"
					title="Done (E)"
					tabindex={actionTab}
					onclick={ondone}><Check /></button
				>
				<button
					type="button"
					class={buttonClass('ghost', 'icon-sm')}
					aria-label="Snooze until tomorrow 9:00"
					title="Snooze (S)"
					tabindex={actionTab}
					onclick={onsnooze}><AlarmClock /></button
				>
				<button
					type="button"
					class={buttonClass('ghost', 'icon-sm')}
					aria-label="Mute thread"
					title="Mute (M)"
					tabindex={actionTab}
					onclick={onmute}><BellOff /></button
				>
			{:else}
				<button
					type="button"
					class={buttonClass('ghost', 'sm')}
					tabindex={actionTab}
					onclick={onrestore}
				>
					<Undo />
					{t.muted ? 'Unmute' : 'Move to inbox'}
				</button>
			{/if}
		</div>
		<button
			type="button"
			class={buttonClass(
				needsYou && inInbox ? 'default' : 'outline',
				'sm',
				'ml-1 min-w-18 max-sm:hidden'
			)}
			tabindex={actionTab}
			onclick={onopen}
		>
			{t.actionLabel}
			<ExternalLink class="opacity-60" />
		</button>
	</div>
</div>

<style>
	.row {
		--row-bg: var(--background);
	}
	.row:hover {
		--row-bg: color-mix(in oklab, var(--muted) 50%, var(--background));
	}
	.row[data-selected] {
		--row-bg: color-mix(in oklab, var(--muted) 60%, var(--background));
	}
</style>
