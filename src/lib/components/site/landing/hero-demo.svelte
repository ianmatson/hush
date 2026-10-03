<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { flip } from 'svelte/animate';
	import { fly, slide } from 'svelte/transition';
	import { MediaQuery } from 'svelte/reactivity';
	import { cx } from './demo-ui';
	import Search from '@lucide/svelte/icons/search';
	import Bell from '@lucide/svelte/icons/bell';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import MockAvatar from './mock-avatar.svelte';
	import PushAlert from './push-alert.svelte';
	import DemoRow from './demo-row.svelte';
	import DemoPeek, { type CommentMode } from './demo-peek.svelte';
	import DemoDash from './demo-dash.svelte';
	import { PEOPLE } from './mock';
	import {
		DEMO_DASH,
		DEMO_THREADS,
		DASH_SECTIONS,
		type DemoDashItem,
		type DemoEntry,
		type DemoPeek as PeekData,
		type DemoThread
	} from './demo-data';

	type Page = 'inbox' | 'pulls' | 'issues';
	type ViewId = 'action' | 'fyi' | 'snoozed' | 'done' | 'muted' | 'web';
	interface Toast {
		key: number;
		text: string;
		undo?: () => void;
		fuseMs?: number;
	}

	const TOAST_MS = 4500;
	const APPROVE_DELAY_MS = 5000;
	const RERUN_MS = 3500;
	const MERGE_CONFIRM_MS = 4000;
	const ALERT_THREAD = 't-review';
	const SAVED_VIEW_REPO = 'acme/web';
	const VIEWS: { id: ViewId; label: string; strong?: boolean; counted?: boolean }[] = [
		{ id: 'action', label: 'Needs you', strong: true, counted: true },
		{ id: 'fyi', label: 'FYI', counted: true },
		{ id: 'snoozed', label: 'Snoozed' },
		{ id: 'done', label: 'Done' },
		{ id: 'muted', label: 'Muted' },
		{ id: 'web', label: 'Web', counted: true }
	];

	const reducedMotion = new MediaQuery('prefers-reduced-motion: reduce');
	const motion = $derived(reducedMotion.current ? 0 : 200);

	let threads = $state<DemoThread[]>(structuredClone(DEMO_THREADS));
	let dash = $state(structuredClone(DEMO_DASH));
	let page = $state<Page>('inbox');
	let view = $state<ViewId>('action');
	let selectedThread = $state<string | null>('t-review');
	let selectedDash = $state<Record<'pulls' | 'issues', string | null>>({
		pulls: 'p-482',
		issues: 'i-477'
	});
	let hiddenDash = $state<string[]>([]);
	let peekOpen = $state(false);
	let alertShown = $state(true);
	let approvingId = $state<string | null>(null);
	let rerunningId = $state<string | null>(null);
	let confirmingMergeId = $state<string | null>(null);
	let toast = $state<Toast | null>(null);
	let listEl = $state<HTMLElement | null>(null);

	const timers = new Set<ReturnType<typeof setTimeout>>();
	let toastTimer: ReturnType<typeof setTimeout> | undefined;
	let approveTimer: ReturnType<typeof setTimeout> | undefined;
	let toastKey = 0;

	function later(ms: number, run: () => void) {
		const id = setTimeout(() => {
			timers.delete(id);
			run();
		}, ms);
		timers.add(id);
		return id;
	}

	onDestroy(() => {
		for (const id of timers) clearTimeout(id);
		clearTimeout(toastTimer);
		clearTimeout(approveTimer);
	});

	function showToast(text: string, undo?: () => void, fuseMs?: number) {
		clearTimeout(toastTimer);
		toast = { key: ++toastKey, text, undo, fuseMs };
		const key = toast.key;
		toastTimer = setTimeout(
			() => {
				if (toast?.key === key) toast = null;
			},
			(fuseMs ?? 0) + TOAST_MS
		);
	}

	function inView(t: DemoThread, v: ViewId) {
		if (v === 'muted') return t.muted;
		if (t.muted) return false;
		if (v === 'snoozed') return t.triage === 'snoozed';
		if (v === 'done') return t.triage === 'done';
		if (t.triage !== 'inbox') return false;
		if (v === 'web') return t.repo === SAVED_VIEW_REPO;
		return t.list === v;
	}

	const visible = $derived(threads.filter((t) => inView(t, view)));
	const countOf = (v: ViewId) => threads.filter((t) => inView(t, v)).length;
	const current = $derived(visible.find((t) => t.id === selectedThread) ?? visible[0] ?? null);
	const dashItems = $derived(
		page === 'inbox' ? [] : dash[page].filter((i) => !hiddenDash.includes(i.id))
	);
	const turnCount = (p: 'pulls' | 'issues') =>
		dash[p].filter((i) => i.group === 'yours' && !hiddenDash.includes(i.id)).length;
	const currentDash = $derived.by(() => {
		if (page === 'inbox') return null;
		const wanted = selectedDash[page];
		return dashItems.find((i) => i.id === wanted) ?? dashItems[0] ?? null;
	});
	const NAV = $derived([
		{ id: 'inbox' as const, label: 'Inbox', short: '', badge: countOf('action') },
		{ id: 'pulls' as const, label: 'Pull requests', short: 'PRs', badge: turnCount('pulls') },
		{ id: 'issues' as const, label: 'Issues', short: '', badge: turnCount('issues') }
	]);

	const byId = (id: string) => threads.find((t) => t.id === id);
	const refOf = (t: { repo: string; number: number | null }) =>
		t.number ? `${t.repo}#${t.number}` : t.repo;
	const end = (s: string) => (/[.!?…]$/.test(s) ? s : `${s}.`);

	function leadOf(t: DemoThread) {
		if (t.muted) return 'Muted';
		if (t.triage === 'done') return 'Done';
		if (t.triage === 'snoozed') return 'Snoozed';
		return t.list === 'action' ? 'Needs you' : 'FYI';
	}

	function whyText(t: DemoThread) {
		const notes = [
			t.why && `GitHub: ${t.why.charAt(0).toLowerCase()}${t.why.slice(1)}`,
			t.rule && (t.rule === 'Muted by you' ? 'You muted it' : `Rule: ${t.rule}`),
			t.note && `Hush moved it: ✓ ${t.note}`
		].filter((n): n is string => !!n);
		return [t.summary, ...notes].map(end).join(' ');
	}

	function selectAfterLeaving(id: string, before: DemoThread[]) {
		if (selectedThread !== id && current?.id !== id) return;
		if (visible.some((t) => t.id === id)) return;
		const at = before.findIndex((t) => t.id === id);
		const next = before.slice(at + 1).find((t) => t.id !== id) ?? before[at - 1];
		selectedThread = next?.id ?? null;
		const focusWasInList = !!listEl?.contains(document.activeElement);
		if (focusWasInList && next) tick().then(() => focusRow(next.id));
	}

	function focusRow(id: string) {
		listEl?.querySelector<HTMLElement>(`[data-demo-row="${id}"] button`)?.focus();
	}

	function change(id: string, patch: Partial<DemoThread>, message: string, undoable = true) {
		const t = byId(id);
		if (!t) return;
		const before = visible.slice();
		const snapshot: Partial<DemoThread> = {
			triage: t.triage,
			muted: t.muted,
			rule: t.rule,
			note: t.note,
			snoozedLabel: t.snoozedLabel,
			unread: t.unread
		};
		Object.assign(t, patch);
		selectAfterLeaving(id, before);
		showToast(message, undoable ? () => restoreSnapshot(id, snapshot) : undefined);
	}

	function restoreSnapshot(id: string, snapshot: Partial<DemoThread>) {
		const t = byId(id);
		if (!t) return;
		Object.assign(t, snapshot);
		selectedThread = id;
		toast = null;
	}

	const markDone = (id: string) =>
		change(id, { triage: 'done', unread: false }, `Marked done: ${byId(id)?.title}`);
	const snooze = (id: string, label = 'until tomorrow 9:00') =>
		change(
			id,
			{ triage: 'snoozed', snoozedLabel: label, unread: false },
			`Snoozed ${label === 'for 3 hours' ? 'for 3 hours' : label}: ${byId(id)?.title}`
		);
	const mute = (id: string) =>
		change(id, { muted: true, rule: 'Muted by you' }, `Muted: ${byId(id)?.title}`);

	function restore(id: string) {
		const t = byId(id);
		if (!t) return;
		change(
			id,
			{
				triage: 'inbox',
				muted: false,
				rule: t.rule === 'Muted by you' ? undefined : t.rule,
				snoozedLabel: undefined,
				note: undefined
			},
			`${t.muted ? 'Unmuted' : 'Moved to inbox'}: ${t.title}`
		);
	}

	function openOnGitHub(t: DemoThread) {
		t.unread = false;
		showToast(`Opens ${t.opensTo} of ${refOf(t)} on GitHub.`);
	}

	function resolve(id: string | undefined, note: string) {
		const t = id ? byId(id) : undefined;
		if (!t || t.triage === 'done') return;
		const before = visible.slice();
		Object.assign(t, { triage: 'done', note, unread: false });
		selectAfterLeaving(t.id, before);
	}

	function addEntry(peek: PeekData, entry: Omit<DemoEntry, 'ago'>) {
		peek.timeline.push({ ...entry, ago: 'now' });
	}

	function approve(peek: PeekData, reference: string, threadId?: string) {
		approvingId = reference;
		clearTimeout(approveTimer);
		showToast(
			'Approving in 5s…',
			() => {
				clearTimeout(approveTimer);
				approvingId = null;
				showToast('Approval canceled. Nothing was sent.');
			},
			APPROVE_DELAY_MS
		);
		approveTimer = setTimeout(() => {
			approvingId = null;
			const mine = peek.pr?.reviews.find((r) => r.who.login === PEOPLE.you.login);
			if (mine) mine.state = 'APPROVED';
			else peek.pr?.reviews.push({ who: PEOPLE.you, state: 'APPROVED' });
			addEntry(peek, { who: PEOPLE.you, verb: 'approved', tone: 'good', text: '' });
			resolve(threadId, 'You approved');
			showToast(`Approved ${reference}.`);
		}, APPROVE_DELAY_MS);
	}

	function rerun(peek: PeekData, reference: string, threadId?: string) {
		if (!peek.pr) return;
		const failed = peek.pr.checks.filter((c) => c.state === 'failure');
		for (const check of failed) check.state = 'pending';
		rerunningId = reference;
		showToast(`Re-running ${failed.length} failed jobs on ${reference}.`);
		later(RERUN_MS, () => {
			for (const check of failed) check.state = 'success';
			rerunningId = null;
			resolve(threadId, 'CI passes now');
			showToast(`CI passes now on ${reference}. Hush moved it to Done.`);
		});
	}

	function merge(peek: PeekData, reference: string, threadId?: string) {
		if (confirmingMergeId !== reference) {
			confirmingMergeId = reference;
			later(MERGE_CONFIRM_MS, () => {
				if (confirmingMergeId === reference) confirmingMergeId = null;
			});
			return;
		}
		confirmingMergeId = null;
		peek.state = 'merged';
		resolve(threadId, 'You merged');
		showToast(`Merged ${reference}.`);
	}

	function comment(
		peek: PeekData,
		reference: string,
		body: string,
		mode: CommentMode,
		thread?: DemoThread
	) {
		const verb =
			mode === 'approve' ? 'approved' : mode === 'changes' ? 'requested changes' : 'commented';
		const tone = mode === 'approve' ? 'good' : mode === 'changes' ? 'bad' : undefined;
		addEntry(peek, { who: PEOPLE.you, verb, tone, text: body });
		if (mode === 'approve') resolve(thread?.id, 'You approved');
		else if (mode === 'changes') resolve(thread?.id, 'You requested changes');
		else if (thread?.kind === 'reply') resolve(thread.id, 'You replied');
		showToast(
			mode === 'comment'
				? `Commented on ${reference}.`
				: `${verb[0].toUpperCase()}${verb.slice(1)} ${reference}.`
		);
	}

	function hideDash(item: DemoDashItem) {
		hiddenDash = [...hiddenDash, item.id];
		showToast(`Hidden until it changes: ${item.title}`, () => {
			hiddenDash = hiddenDash.filter((id) => id !== item.id);
			toast = null;
		});
	}

	function goTo(next: Page) {
		page = next;
		peekOpen = false;
	}

	function pickView(next: ViewId) {
		view = next;
		peekOpen = false;
	}

	function selectThread(t: DemoThread) {
		selectedThread = t.id;
		peekOpen = true;
		if (t.unread) later(800, () => (t.unread = false));
	}

	function selectDash(item: DemoDashItem) {
		if (page === 'inbox') return;
		selectedDash[page] = item.id;
		peekOpen = true;
	}

	async function moveCursor(step: number) {
		if (page === 'inbox') {
			if (!visible.length) return;
			const at = Math.max(
				0,
				visible.findIndex((t) => t.id === current?.id)
			);
			const next = visible[Math.min(visible.length - 1, Math.max(0, at + step))];
			selectedThread = next.id;
			await tick();
			focusRow(next.id);
			return;
		}
		if (!dashItems.length) return;
		const at = Math.max(
			0,
			dashItems.findIndex((i) => i.id === currentDash?.id)
		);
		const next = dashItems[Math.min(dashItems.length - 1, Math.max(0, at + step))];
		selectedDash[page] = next.id;
	}

	function onKey(e: KeyboardEvent) {
		if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
		if ((e.target as HTMLElement).closest('textarea, input')) return;
		const key = e.key.toLowerCase();
		const t = page === 'inbox' ? current : null;
		const inInbox = !!t && t.triage === 'inbox' && !t.muted;
		if (key === 'j' || e.key === 'ArrowDown') moveCursor(1);
		else if (key === 'k' || e.key === 'ArrowUp') moveCursor(-1);
		else if (key === 'e' && inInbox) markDone(t.id);
		else if (key === 's' && inInbox) snooze(t.id);
		else if (key === 'm' && inInbox) mute(t.id);
		else if (e.key === 'Escape' && peekOpen) peekOpen = false;
		else return;
		e.preventDefault();
	}

	function listenForKeys(node: HTMLElement) {
		node.addEventListener('keydown', onKey);
		return () => node.removeEventListener('keydown', onKey);
	}

	function alertDone() {
		markDone(ALERT_THREAD);
		alertShown = false;
	}

	function alertSnooze() {
		snooze(ALERT_THREAD, 'for 3 hours');
		alertShown = false;
	}

	function alertOpen() {
		page = 'inbox';
		view = inView(byId(ALERT_THREAD)!, 'action') ? 'action' : 'done';
		selectedThread = ALERT_THREAD;
		peekOpen = true;
		alertShown = false;
	}

	const dashPeek = (item: DemoDashItem) =>
		(item.threadId && byId(item.threadId)?.peek) || item.peek;
</script>

<div class="stage" role="region" aria-label="Interactive demo of Hush" {@attach listenForKeys}>
	<div class="window">
		<header class="flex h-12 items-center gap-4 border-b px-4 max-sm:gap-2 max-sm:px-3">
			<span class="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
				<img src="/icon.svg" alt="" class="size-5 rounded-[5px]" />
				<span class="hidden sm:inline">hush</span>
			</span>
			<nav
				class="flex min-w-0 items-center gap-0.5 overflow-x-auto text-sm"
				aria-label="Demo pages"
			>
				{#each NAV as link (link.id)}
					<button
						type="button"
						aria-current={page === link.id ? 'page' : undefined}
						class={cx(
							'flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground transition-colors hover:text-foreground',
							page === link.id && 'bg-muted text-foreground'
						)}
						onclick={() => goTo(link.id)}
					>
						{#if link.short}<span class="sm:hidden">{link.short}</span><span class="max-sm:hidden"
								>{link.label}</span
							>{:else}{link.label}{/if}
						{#if link.badge}
							<span
								class="min-w-4.5 rounded-full bg-primary px-1 text-center text-[0.68rem] leading-4 text-primary-foreground tabular-nums"
								>{link.badge}</span
							>
						{/if}
					</button>
				{/each}
			</nav>
			<div class="ml-auto flex items-center gap-1">
				<button
					type="button"
					class="flex h-7 items-center gap-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground max-md:w-7 max-md:justify-center max-sm:hidden md:border md:pr-1 md:pl-2 md:text-xs"
					aria-label="Search and commands"
					onclick={() => showToast('⌘K finds threads, pull requests, pages, and commands.')}
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
				<MockAvatar person={PEOPLE.you} size={1.75} />
			</div>
		</header>

		<div class="body" data-peek-open={peekOpen || undefined}>
			<div class="main">
				{#if page === 'inbox'}
					<nav
						class="flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-muted p-0.5 text-sm"
						aria-label="Views"
					>
						{#each VIEWS as v (v.id)}
							{@const count = v.counted ? countOf(v.id) : 0}
							<button
								type="button"
								aria-current={view === v.id ? 'page' : undefined}
								class={cx(
									'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
									view === v.id && 'bg-background text-foreground shadow-xs'
								)}
								onclick={() => pickView(v.id)}
							>
								{v.label}
								{#if count}
									<span
										class={cx(
											'min-w-4.5 rounded-full px-1 text-center text-[0.7rem] leading-4 tabular-nums',
											v.strong ? 'bg-primary text-primary-foreground' : 'bg-foreground/10'
										)}>{count}</span
									>
								{/if}
							</button>
						{/each}
					</nav>
					<p class="mt-3 mb-2 px-1 text-xs text-muted-foreground">
						Synced 1m ago{#if view === 'web'}
							· Needs you + FYI, repo:acme/web{:else if view === 'fyi'}
							· Activity you may want to know about, but that does not need you.{/if}
					</p>
					{#if visible.length}
						<ul
							bind:this={listEl}
							class="grid grid-cols-[minmax(0,1fr)] gap-0.5"
							aria-label="Threads"
						>
							{#each visible as t (t.id)}
								<li
									data-demo-row={t.id}
									class="row-enter"
									animate:flip={{ duration: motion }}
									out:slide={{ duration: motion }}
								>
									<DemoRow
										thread={t}
										selected={t.id === current?.id}
										onselect={() => selectThread(t)}
										ondone={() => markDone(t.id)}
										onsnooze={() => snooze(t.id)}
										onmute={() => mute(t.id)}
										onrestore={() => restore(t.id)}
										onopen={() => openOnGitHub(t)}
									/>
								</li>
							{/each}
						</ul>
					{:else}
						<div
							class="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center"
						>
							<CircleCheck class="mb-3 size-8 text-signal-merge" />
							<p class="font-medium">
								{view === 'action' ? 'Nothing needs you.' : 'This view is empty.'}
							</p>
							{#if view === 'action'}
								<p class="mt-1 text-sm text-muted-foreground">Done, Snooze, and Mute have Undo.</p>
							{/if}
						</div>
					{/if}
				{:else}
					<DemoDash
						items={dashItems}
						sections={DASH_SECTIONS[page]}
						selectedId={currentDash?.id ?? null}
						{motion}
						onselect={selectDash}
					/>
				{/if}
			</div>

			<aside class="peek" aria-label="Peek">
				{#if page === 'inbox' && current}
					{@const t = current}
					<DemoPeek
						lead={leadOf(t)}
						text={whyText(t)}
						changes={t.triage === 'inbox' ? (t.changes ?? []) : []}
						title={t.title}
						reference={refOf(t)}
						peek={t.peek}
						place={t.triage === 'inbox' && !t.muted ? 'inbox' : 'away'}
						approving={approvingId === refOf(t)}
						rerunning={rerunningId === refOf(t)}
						confirmingMerge={confirmingMergeId === refOf(t)}
						ondone={() => markDone(t.id)}
						onsnooze={() => snooze(t.id)}
						onmute={() => mute(t.id)}
						onrestore={() => restore(t.id)}
						onhide={() => {}}
						onapprove={() => approve(t.peek, refOf(t), t.id)}
						onrerun={() => rerun(t.peek, refOf(t), t.id)}
						onmerge={() => merge(t.peek, refOf(t), t.id)}
						oncomment={(body, mode) => comment(t.peek, refOf(t), body, mode, t)}
						onopen={() => openOnGitHub(t)}
						onclose={() => (peekOpen = false)}
					/>
				{:else if currentDash}
					{@const item = currentDash}
					{@const peek = dashPeek(item)}
					{@const reference = `${item.repo}#${item.number}`}
					{@const linked = item.threadId ? byId(item.threadId) : undefined}
					<DemoPeek
						lead={item.group === 'yours'
							? 'Your turn'
							: item.group === 'team'
								? 'Your team’s turn'
								: item.group === 'waiting'
									? 'Waiting on others'
									: 'Other'}
						text={end(item.reason)}
						title={item.title}
						{reference}
						{peek}
						place="dash"
						approving={approvingId === reference}
						rerunning={rerunningId === reference}
						confirmingMerge={confirmingMergeId === reference}
						ondone={() => {}}
						onsnooze={() => {}}
						onmute={() => {}}
						onrestore={() => {}}
						onhide={() => hideDash(item)}
						onapprove={() => approve(peek, reference, item.threadId)}
						onrerun={() => rerun(peek, reference, item.threadId)}
						onmerge={() => merge(peek, reference, item.threadId)}
						oncomment={(body, mode) => comment(peek, reference, body, mode, linked)}
						onopen={() => showToast(`Opens ${reference} on GitHub.`)}
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
						{#if toast.fuseMs}
							<span class="fuse" style:--fuse="{toast.fuseMs}ms"></span>
						{/if}
					</div>
				{/key}
			{/if}
		</div>
	</div>

	{#if alertShown}
		<div class="float float-enter" out:fly={{ y: -12, duration: motion }}>
			<PushAlert
				title="@alice requests your review"
				body="acme/web#482 · Fix token refresh race in session middleware"
				onopen={alertOpen}
				actions={[
					{ label: 'Done', run: alertDone },
					{ label: 'Snooze 3h', run: alertSnooze }
				]}
			/>
		</div>
	{/if}
</div>
<p class="hint">
	A working demo with sample data. Click a row, or use <kbd>J</kbd> <kbd>K</kbd> to move,
	<kbd>E</kbd> for Done, and <kbd>S</kbd> to snooze.
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
	.fuse {
		position: absolute;
		left: 0;
		bottom: 0;
		width: 100%;
		height: 2px;
		background: var(--signal-review);
		transform-origin: left;
		animation: fuse var(--fuse) linear both;
	}
	@keyframes fuse {
		to {
			scale: 0 1;
		}
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
	.hint kbd {
		padding: 0 0.3em;
		border-radius: 0.25rem;
		border: 1px solid var(--border);
		border-bottom-width: 2px;
		font: inherit;
		font-size: 0.75rem;
	}

	@media (max-width: 72rem) {
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
		.fuse {
			animation: none;
		}
	}
	.row-enter {
		animation: demo-rise 0.2s ease-out both;
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
		.row-enter,
		.toast-enter,
		.float-enter {
			animation: none;
		}
	}
</style>
