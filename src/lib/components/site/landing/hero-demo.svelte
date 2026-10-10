<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import { MediaQuery } from 'svelte/reactivity';
	import { cx } from './demo-ui';
	import Search from '@lucide/svelte/icons/search';
	import Bell from '@lucide/svelte/icons/bell';
	import Plus from '@lucide/svelte/icons/plus';
	import Rows3 from '@lucide/svelte/icons/rows-3';
	import Check from '@lucide/svelte/icons/check';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import MockAvatar from './mock-avatar.svelte';
	import PushAlert from './push-alert.svelte';
	import DemoList from './demo-list.svelte';
	import DemoPeek, { type CommentMode } from './demo-peek.svelte';
	import {
		DEMO_DASH,
		DEMO_ME,
		DEMO_VIEWS,
		GROUP_BY_CHOICES,
		demoSections,
		inDemoView,
		type DemoDashItem,
		type DemoEntry,
		type DemoGroupBy,
		type DemoPeek as PeekData,
		type DemoViewId
	} from './demo-data';

	type Kind = 'pulls' | 'issues';
	interface Toast {
		key: number;
		text: string;
		undo?: () => void;
	}

	const TOAST_MS = 4500;
	const RERUN_MS = 3500;
	const MERGE_CONFIRM_MS = 4000;
	const GROUP_BY_TOUR_MS = 3400;
	const GROUP_BY_TOUR: DemoGroupBy[] = ['role', 'status', 'custom'];
	const ALERT_ITEM = 'p-20508';
	const KINDS: { id: Kind; label: string }[] = [
		{ id: 'pulls', label: 'Pull requests' },
		{ id: 'issues', label: 'Issues' }
	];

	const reducedMotion = new MediaQuery('prefers-reduced-motion: reduce');
	const motion = $derived(reducedMotion.current ? 0 : 220);

	let dash = $state(structuredClone(DEMO_DASH));
	let view = $state<DemoViewId>('mine');
	let kind = $state<Kind>('pulls');
	let groupBy = $state<Record<DemoViewId, DemoGroupBy>>(
		Object.fromEntries(DEMO_VIEWS.map((v) => [v.id, v.groupBy])) as Record<DemoViewId, DemoGroupBy>
	);
	let selected = $state<Record<Kind, string | null>>({ pulls: 'p-20387', issues: 'i-20700' });
	let away = $state<string[]>([]);
	let unread = $state<string[]>(['p-20387', 'p-20454', 'i-20700']);
	let peekOpen = $state(false);
	let groupMenuOpen = $state(false);
	let alertShown = $state(true);
	let touring = $state(false);
	let rerunningId = $state<string | null>(null);
	let confirmingMergeId = $state<string | null>(null);
	let toast = $state<Toast | null>(null);
	let stageEl = $state<HTMLElement | null>(null);

	const timers = new Set<ReturnType<typeof setTimeout>>();
	let toastTimer: ReturnType<typeof setTimeout> | undefined;
	let tourTimer: ReturnType<typeof setInterval> | undefined;
	let toastKey = 0;

	function later(ms: number, run: () => void) {
		const id = setTimeout(() => {
			timers.delete(id);
			run();
		}, ms);
		timers.add(id);
	}

	onDestroy(() => {
		for (const id of timers) clearTimeout(id);
		clearTimeout(toastTimer);
		clearInterval(tourTimer);
	});

	function showToast(text: string, undo?: () => void) {
		clearTimeout(toastTimer);
		toast = { key: ++toastKey, text, undo };
		const key = toast.key;
		toastTimer = setTimeout(() => {
			if (toast?.key === key) toast = null;
		}, TOAST_MS);
	}

	const inView = (i: DemoDashItem, v: DemoViewId) => inDemoView(i, v) && !away.includes(i.id);
	const items = $derived(dash[kind].filter((i) => inView(i, view)));
	const sections = $derived(demoSections(items, groupBy[view]));
	const ordered = $derived(sections.flatMap((s) => s.items));
	const current = $derived(ordered.find((i) => i.id === selected[kind]) ?? ordered[0] ?? null);
	const unreadIn = (v: DemoViewId) =>
		[...dash.pulls, ...dash.issues].filter((i) => inView(i, v) && unread.includes(i.id)).length;
	const countOf = (k: Kind) => dash[k].filter((i) => inView(i, view)).length;
	const groupLabel = $derived(GROUP_BY_CHOICES.find((c) => c.id === groupBy[view])?.label ?? '');
	const byId = (id: string) => [...dash.pulls, ...dash.issues].find((i) => i.id === id);
	const alertItem = $derived(byId(ALERT_ITEM)!);
	const refOf = (i: DemoDashItem) => `${i.repo}#${i.number}`;
	const end = (s: string) => (/[.!?…]$/.test(s) ? s : `${s}.`);
	const LEAD = {
		yours: 'Your turn',
		team: 'Your team’s turn',
		waiting: 'Waiting on others',
		other: 'Involves you'
	};

	function stopTour() {
		touring = false;
		clearInterval(tourTimer);
	}

	function startTour() {
		if (reducedMotion.current || touring) return;
		touring = true;
		tourTimer = setInterval(() => {
			if (view !== 'mine' || kind !== 'pulls') return;
			const at = GROUP_BY_TOUR.indexOf(groupBy.mine);
			groupBy.mine = GROUP_BY_TOUR[(at + 1) % GROUP_BY_TOUR.length];
		}, GROUP_BY_TOUR_MS);
	}

	function watchVisibility(node: HTMLElement) {
		const seen = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) startTour();
				else if (touring) (clearInterval(tourTimer), (touring = false));
			},
			{ threshold: 0.4 }
		);
		seen.observe(node);
		return () => seen.disconnect();
	}

	function takeOver() {
		stopTour();
	}

	function setGroupBy(by: DemoGroupBy) {
		stopTour();
		groupBy[view] = by;
		groupMenuOpen = false;
	}

	function leave(item: DemoDashItem, message: string) {
		stopTour();
		const before = ordered.slice();
		away = [...away, item.id];
		if (current?.id === item.id) {
			const at = before.findIndex((i) => i.id === item.id);
			selected[kind] = (before[at + 1] ?? before[at - 1])?.id ?? null;
		}
		showToast(message, () => {
			away = away.filter((id) => id !== item.id);
			selected[kind] = item.id;
			toast = null;
		});
	}

	const snooze = (item: DemoDashItem) => leave(item, `Snoozed until new activity: ${item.title}`);
	const mute = (item: DemoDashItem) => leave(item, `Muted: ${item.title}`);
	const copy = (item: DemoDashItem) => showToast(`Copied the link to ${refOf(item)}.`);
	const open = (item: DemoDashItem) => window.open(item.url, '_blank', 'noopener');

	function select(item: DemoDashItem) {
		stopTour();
		selected[kind] = item.id;
		peekOpen = true;
		unread = unread.filter((id) => id !== item.id);
	}

	function goTo(next: DemoViewId) {
		stopTour();
		view = next;
		peekOpen = false;
		groupMenuOpen = false;
	}

	function pickKind(next: Kind) {
		stopTour();
		kind = next;
		peekOpen = false;
	}

	function addEntry(peek: PeekData, entry: Omit<DemoEntry, 'ago'>) {
		peek.timeline.push({ ...entry, ago: 'now' });
	}

	function approve(peek: PeekData, reference: string) {
		const mine = peek.pr?.reviews.find((r) => r.who.login === DEMO_ME.login);
		if (mine) mine.state = 'APPROVED';
		else peek.pr?.reviews.push({ who: DEMO_ME, state: 'APPROVED' });
		addEntry(peek, { who: DEMO_ME, verb: 'approved', tone: 'good', text: '' });
		showToast(`Approved ${reference}.`);
	}

	function rerun(item: DemoDashItem, reference: string) {
		const peek = item.peek;
		if (!peek.pr) return;
		const failed = peek.pr.checks.filter((c) => c.state === 'failure');
		for (const check of failed) check.state = 'pending';
		rerunningId = reference;
		item.ci = 'running';
		showToast(`Re-running ${failed.length} failed jobs on ${reference}.`);
		later(RERUN_MS, () => {
			for (const check of failed) check.state = 'success';
			rerunningId = null;
			item.ci = 'pass';
			showToast(`CI passes now on ${reference}.`);
		});
	}

	function merge(peek: PeekData, reference: string) {
		if (confirmingMergeId !== reference) {
			confirmingMergeId = reference;
			later(MERGE_CONFIRM_MS, () => {
				if (confirmingMergeId === reference) confirmingMergeId = null;
			});
			return;
		}
		confirmingMergeId = null;
		peek.state = 'merged';
		showToast(`Merged ${reference}.`);
	}

	function comment(peek: PeekData, reference: string, body: string, mode: CommentMode) {
		const verb =
			mode === 'approve' ? 'approved' : mode === 'changes' ? 'requested changes' : 'commented';
		const tone = mode === 'approve' ? 'good' : mode === 'changes' ? 'bad' : undefined;
		addEntry(peek, { who: DEMO_ME, verb, tone, text: body });
		showToast(
			mode === 'comment'
				? `Commented on ${reference}.`
				: `${verb[0].toUpperCase()}${verb.slice(1)} ${reference}.`
		);
	}

	async function moveCursor(step: number) {
		stopTour();
		if (!ordered.length) return;
		const at = Math.max(
			0,
			ordered.findIndex((i) => i.id === current?.id)
		);
		const next = ordered[Math.min(ordered.length - 1, Math.max(0, at + step))];
		selected[kind] = next.id;
		await tick();
		stageEl?.querySelector<HTMLElement>(`[data-demo-dash-row="${next.id}"] .row-main`)?.focus();
	}

	function cycleGroupBy() {
		const at = GROUP_BY_TOUR.indexOf(groupBy[view]);
		setGroupBy(GROUP_BY_TOUR[(at + 1) % GROUP_BY_TOUR.length]);
	}

	function onKey(e: KeyboardEvent) {
		if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
		if ((e.target as HTMLElement).closest('textarea, input')) return;
		const key = e.key.toLowerCase();
		if (key === 'j' || e.key === 'ArrowDown') moveCursor(1);
		else if (key === 'k' || e.key === 'ArrowUp') moveCursor(-1);
		else if (key === 'g') cycleGroupBy();
		else if (key === 's' && current) snooze(current);
		else if (key === 'm' && current) mute(current);
		else if (key === 'c' && current) copy(current);
		else if (e.key === 'Escape' && (peekOpen || groupMenuOpen))
			((peekOpen = false), (groupMenuOpen = false));
		else return;
		e.preventDefault();
	}

	function listenForKeys(node: HTMLElement) {
		node.addEventListener('keydown', onKey);
		return () => node.removeEventListener('keydown', onKey);
	}

	function alertOpen() {
		stopTour();
		view = 'mine';
		kind = 'pulls';
		away = away.filter((id) => id !== ALERT_ITEM);
		selected.pulls = ALERT_ITEM;
		peekOpen = true;
		alertShown = false;
	}
</script>

<div
	class="stage"
	role="region"
	aria-label="Interactive demo of Hush"
	bind:this={stageEl}
	{@attach listenForKeys}
	{@attach watchVisibility}
	onpointerdown={takeOver}
	onfocusin={takeOver}
>
	<div class="window">
		<header class="flex h-12 items-center gap-4 border-b px-4 max-sm:gap-2 max-sm:px-3">
			<span class="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
				<img src="/icon.svg" alt="" class="size-5 rounded-[5px]" />
				<span class="hidden sm:inline">hush</span>
			</span>
			<nav
				class="flex min-w-0 items-center gap-0.5 overflow-x-auto text-sm"
				aria-label="Demo views"
			>
				{#each DEMO_VIEWS as v (v.id)}
					{@const badge = unreadIn(v.id)}
					<button
						type="button"
						aria-current={view === v.id ? 'page' : undefined}
						class={cx(
							'flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground transition-colors hover:text-foreground',
							view === v.id && 'bg-muted text-foreground'
						)}
						onclick={() => goTo(v.id)}
					>
						{v.name}
						{#if badge}
							<span
								class="min-w-4.5 rounded-full bg-primary px-1 text-center text-[0.68rem] leading-4 text-primary-foreground tabular-nums"
								>{badge}</span
							>
						{/if}
					</button>
				{/each}
				<button
					type="button"
					class="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
					aria-label="New view"
					onclick={() =>
						showToast('A new view is a name and a search, such as repo:acme/web is:open size:<50.')}
					><Plus class="size-4" /></button
				>
			</nav>
			<div class="ml-auto flex items-center gap-1">
				<button
					type="button"
					class="flex h-7 items-center gap-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground max-md:w-7 max-md:justify-center max-sm:hidden md:border md:pr-1 md:pl-2 md:text-xs"
					aria-label="Search and commands"
					onclick={() => showToast('⌘K finds pull requests, issues, pages, and commands.')}
				>
					<Search class="size-4 md:size-3.5" /><span class="hidden md:inline">Search</span><kbd
						class="hidden rounded bg-muted px-1 font-sans text-[0.65rem] md:inline">⌘K</kbd
					>
				</button>
				<button
					type="button"
					class="relative flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground max-sm:hidden"
					aria-label="Alerts"
					onclick={() => (alertShown = !alertShown)}
				>
					<Bell class="size-4" />
				</button>
				<MockAvatar person={DEMO_ME} size={1.75} />
			</div>
		</header>

		<div class="body" data-peek-open={peekOpen || undefined}>
			<div class="main">
				<div class="flex items-center gap-2 px-1">
					<div class="flex min-w-0 gap-1 overflow-x-auto" role="tablist" aria-label="Kind">
						{#each KINDS as k (k.id)}
							<button
								type="button"
								role="tab"
								aria-selected={kind === k.id}
								class={cx(
									'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
									kind === k.id
										? 'border-foreground/20 bg-foreground text-background'
										: 'text-muted-foreground hover:bg-muted hover:text-foreground'
								)}
								onclick={() => pickKind(k.id)}
							>
								{k.label}
								<span class="tabular-nums opacity-70">{countOf(k.id)}</span>
							</button>
						{/each}
					</div>
					<div class="relative ml-auto">
						<button
							type="button"
							class={cx(
								'group-by flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-muted',
								touring && 'touring'
							)}
							aria-expanded={groupMenuOpen}
							aria-label="Group by {groupLabel}"
							onclick={() => (groupMenuOpen = !groupMenuOpen)}
						>
							<Rows3 class="size-3.5" />
							{#key groupLabel}
								<span class="label-swap">{groupLabel}</span>
							{/key}
						</button>
						{#if groupMenuOpen}
							<div
								class="absolute right-0 z-10 mt-1 grid w-48 rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md"
								transition:fly={{ y: -4, duration: motion }}
							>
								<p class="px-2 py-1 text-xs text-muted-foreground">Group by</p>
								{#each GROUP_BY_CHOICES as choice (choice.id)}
									<button
										type="button"
										class="flex items-center rounded-md px-2 py-1.5 text-left hover:bg-muted"
										onclick={() => setGroupBy(choice.id)}
									>
										<span class="flex-1">{choice.label}</span>
										{#if choice.id === groupBy[view]}<Check class="size-3.5" />{/if}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</div>
				<p class="mt-2 mb-1 px-1 text-xs text-muted-foreground">Updated 1m ago</p>
				{#if sections.length}
					<DemoList
						{sections}
						selectedId={current?.id ?? null}
						{motion}
						onselect={select}
						onsnooze={snooze}
						onmute={mute}
						oncopy={copy}
						onopen={open}
					/>
				{:else}
					<div
						class="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center"
					>
						<CircleCheck class="mb-3 size-8 text-signal-merge" />
						<p class="font-medium">Nothing here.</p>
						<p class="mt-1 text-sm text-muted-foreground">Snooze and Mute have Undo.</p>
					</div>
				{/if}
			</div>

			<aside class="peek" aria-label="Peek">
				{#if current}
					{@const item = current}
					{@const reference = refOf(item)}
					<DemoPeek
						lead={LEAD[item.group]}
						text={end(item.reason)}
						title={item.title}
						{reference}
						peek={item.peek}
						rerunning={rerunningId === reference}
						confirmingMerge={confirmingMergeId === reference}
						onsnooze={() => snooze(item)}
						onmute={() => mute(item)}
						oncopy={() => copy(item)}
						onapprove={() => approve(item.peek, reference)}
						onrerun={() => rerun(item, reference)}
						onmerge={() => merge(item.peek, reference)}
						oncomment={(body, mode) => comment(item.peek, reference, body, mode)}
						onopen={() => open(item)}
						onclose={() => (peekOpen = false)}
					/>
				{:else}
					<p class="m-auto p-6 text-center text-sm text-muted-foreground">
						Choose a row to peek at it.
					</p>
				{/if}
			</aside>
		</div>

		<div class="toast-slot" aria-live="polite">
			{#if toast}
				{#key toast.key}
					<div
						class="toast toast-enter relative flex items-center gap-3 overflow-hidden rounded-lg border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg"
						out:fly={{ y: 12, duration: motion }}
					>
						<span class="min-w-0 flex-1">{toast.text}</span>
						{#if toast.undo}
							<button
								type="button"
								class="shrink-0 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/85"
								onclick={toast.undo}>Undo</button
							>
						{/if}
					</div>
				{/key}
			{/if}
		</div>
	</div>

	{#if alertShown}
		<div class="float float-enter" out:fly={{ y: -12, duration: motion }}>
			<PushAlert
				title="CI failed on your PR"
				body="{refOf(alertItem)} · {alertItem.title}"
				onopen={alertOpen}
			/>
		</div>
	{/if}
</div>
<p class="hint">
	A working demo with real pull requests and issues from <a
		href="https://github.com/PostHog/posthog.com"
		rel="noreferrer">PostHog/posthog.com</a
	>. Change <b>Group by</b>, click a row, or use <kbd>J</kbd> <kbd>K</kbd> to move,
	<kbd>G</kbd> to group another way, and <kbd>S</kbd> to snooze.
</p>

<style>
	.stage {
		position: relative;
		font-size: 0.875rem;
		line-height: 1.4;
		text-align: left;
	}
	.window {
		position: relative;
		overflow: hidden;
		border-radius: 1rem;
		border: 1px solid color-mix(in oklab, var(--foreground) 10%, transparent);
		background: var(--background);
		box-shadow:
			0 1px 2px rgb(0 0 0 / 0.05),
			0 30px 80px -30px rgb(0 0 0 / 0.35);
	}
	.body {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
		height: 36rem;
	}
	.main {
		min-height: 0;
		overflow-y: auto;
		padding: 0.875rem 0.75rem 1.5rem;
	}
	.peek {
		display: flex;
		flex-direction: column;
		min-height: 0;
		border-left: 1px solid var(--border);
		background: var(--background);
		box-shadow: -12px 0 32px -24px rgb(0 0 0 / 0.25);
	}
	.peek :global(.demo-close) {
		display: none;
	}
	.group-by.touring {
		background: color-mix(in oklab, var(--signal-review) 12%, transparent);
		color: var(--signal-review);
	}
	.label-swap {
		display: inline-block;
		animation: demo-rise 0.25s ease-out both;
		--rise-from: 0.4rem;
	}
	.toast-slot {
		position: absolute;
		left: 1rem;
		bottom: 1rem;
		z-index: 5;
		width: min(26rem, calc(54% - 2rem));
		pointer-events: none;
	}
	.toast {
		pointer-events: auto;
	}
	.float {
		position: absolute;
		top: -4.75rem;
		right: -2rem;
		z-index: 6;
		width: 19rem;
	}
	.hint {
		margin-top: 1rem;
		font-size: 0.8125rem;
		text-align: center;
		color: var(--muted-foreground);
	}
	.hint a {
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.hint b {
		font-weight: 550;
		color: var(--foreground);
	}
	.hint kbd {
		padding: 0 0.3em;
		border-radius: 0.25rem;
		border: 1px solid var(--border);
		border-bottom-width: 2px;
		font: inherit;
		font-size: 0.75rem;
	}

	@media (max-width: 92rem) {
		.float {
			right: -0.75rem;
		}
	}
	@media (max-width: 60rem) {
		.body {
			grid-template-columns: minmax(0, 1fr);
			height: 34rem;
		}
		.toast-slot {
			left: 50%;
			width: min(26rem, calc(100% - 2rem));
			translate: -50% 0;
		}
		.peek {
			position: absolute;
			inset: 0;
			z-index: 4;
			border-left: 0;
			visibility: hidden;
			translate: 0 1.5rem;
			opacity: 0;
			transition:
				opacity 0.2s,
				translate 0.25s cubic-bezier(0.16, 1, 0.3, 1),
				visibility 0s 0.25s;
		}
		.body[data-peek-open] .peek {
			visibility: visible;
			translate: 0 0;
			opacity: 1;
			transition:
				opacity 0.2s,
				translate 0.25s cubic-bezier(0.16, 1, 0.3, 1);
		}
		.peek :global(.demo-close) {
			display: inline-flex;
		}
	}
	@media (max-width: 40rem) {
		.body {
			height: 32rem;
		}
		.main {
			padding: 0.75rem 0.375rem 1.5rem;
		}
		.float {
			position: relative;
			top: auto;
			right: auto;
			width: auto;
			margin: 0.75rem 0.75rem 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.peek {
			transition: none !important;
			translate: 0 0 !important;
		}
	}
	.toast-enter {
		animation: demo-rise 0.2s ease-out both;
		--rise-from: 0.75rem;
	}
	.float-enter {
		animation: demo-rise 0.3s ease-out both;
		--rise-from: -0.75rem;
	}
	@keyframes demo-rise {
		from {
			opacity: 0;
			translate: 0 var(--rise-from, -0.5rem);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.toast-enter,
		.float-enter,
		.label-swap {
			animation: none;
		}
	}
</style>
