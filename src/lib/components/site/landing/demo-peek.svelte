<script lang="ts" module>
	export type CommentMode = 'comment' | 'approve' | 'changes';
</script>

<script lang="ts">
	import { buttonClass, cx } from './demo-ui';
	import Check from '@lucide/svelte/icons/check';
	import AlarmClock from '@lucide/svelte/icons/alarm-clock';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import Undo from '@lucide/svelte/icons/undo-2';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import X from '@lucide/svelte/icons/x';
	import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
	import GitMerge from '@lucide/svelte/icons/git-merge';
	import CircleDot from '@lucide/svelte/icons/circle-dot';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import CircleDashed from '@lucide/svelte/icons/circle-dashed';
	import Tag from '@lucide/svelte/icons/tag';
	import Workflow from '@lucide/svelte/icons/workflow';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { tick } from 'svelte';
	import MockAvatar from './mock-avatar.svelte';
	import SuggestMenu from '$lib/components/app/suggest-menu.svelte';
	import { caretXY } from '$lib/caret';
	import { loadEmojiList } from '$lib/emoji';
	import {
		applyPick,
		closedShortcodeBefore,
		emojiForShortcode,
		rankEmoji,
		rankRefs,
		rankUsers,
		replaceWithEmoji,
		triggerAt,
		type Suggestion,
		type Trigger,
		type UserSuggestion
	} from '$lib/shared/suggest';
	import {
		DEMO_ME,
		DEMO_PEOPLE,
		DEMO_REFS,
		type DemoChange,
		type DemoCheckState,
		type DemoPeek
	} from './demo-data';

	let {
		lead,
		text,
		changes = [],
		title,
		reference,
		peek,
		place,
		approving = false,
		confirmingMerge = false,
		rerunning = false,
		ondone,
		onsnooze,
		onmute,
		onrestore,
		onhide,
		onapprove,
		onrerun,
		onmerge,
		oncomment,
		onopen,
		onclose
	}: {
		lead: string;
		text: string;
		changes?: DemoChange[];
		title: string;
		reference: string;
		peek: DemoPeek;
		place: 'inbox' | 'away' | 'dash';
		approving?: boolean;
		confirmingMerge?: boolean;
		rerunning?: boolean;
		ondone: () => void;
		onsnooze: () => void;
		onmute: () => void;
		onrestore: () => void;
		onhide: () => void;
		onapprove: () => void;
		onrerun: () => void;
		onmerge: () => void;
		oncomment: (body: string, mode: CommentMode) => void;
		onopen: () => void;
		onclose: () => void;
	} = $props();

	let draft = $state('');
	let mode = $state<CommentMode>('comment');
	let moreOpen = $state(false);
	let box = $state<HTMLTextAreaElement | null>(null);

	$effect(() => {
		void reference;
		draft = '';
		mode = 'comment';
		moreOpen = false;
	});

	const STATE = {
		open: { label: 'Open', tone: 'bg-signal-merge/12 text-signal-merge' },
		draft: { label: 'Draft', tone: 'bg-muted text-muted-foreground' },
		merged: { label: 'Merged', tone: 'bg-signal-reply/12 text-signal-reply' },
		closed: { label: 'Closed', tone: 'bg-signal-fail/12 text-signal-fail' },
		published: { label: 'Published', tone: 'bg-signal-merge/12 text-signal-merge' },
		passed: { label: 'Passed', tone: 'bg-signal-merge/12 text-signal-merge' }
	};
	const CHECK: Record<DemoCheckState, { icon: typeof CircleCheck; tone: string; label: string }> = {
		failure: { icon: CircleX, tone: 'text-signal-fail', label: 'failed' },
		pending: { icon: CircleDashed, tone: 'text-signal-warn', label: 'running' },
		success: { icon: CircleCheck, tone: 'text-signal-merge', label: 'passed' }
	};
	const REVIEW = {
		APPROVED: { label: 'approved', tone: 'text-signal-merge' },
		CHANGES_REQUESTED: { label: 'requested changes', tone: 'text-signal-fail' },
		REQUESTED: { label: 'requested', tone: 'text-muted-foreground' }
	};
	const SEND_LABEL: Record<CommentMode, string> = {
		comment: 'Comment',
		approve: 'Approve',
		changes: 'Request changes'
	};

	const stateIcon = $derived(
		peek.kind === 'issue'
			? CircleDot
			: peek.kind === 'release'
				? Tag
				: peek.kind === 'run'
					? Workflow
					: peek.state === 'merged'
						? GitMerge
						: GitPullRequest
	);
	const checkCounts = $derived(
		(['failure', 'pending', 'success'] as const)
			.map((state) => ({ state, n: peek.pr?.checks.filter((c) => c.state === state).length ?? 0 }))
			.filter((x) => x.n)
	);
	const failing = $derived(peek.pr?.checks.some((c) => c.state === 'failure') ?? false);
	const canComment = $derived(peek.kind === 'pr' || peek.kind === 'issue');
	const isOpen = $derived(peek.state === 'open');

	function startComment(next: CommentMode) {
		mode = next;
		moreOpen = false;
		box?.focus();
	}

	function send() {
		const body = draft.trim();
		if (!body && mode !== 'approve') return;
		oncomment(body, mode);
		draft = '';
		mode = 'comment';
	}

	const SUGGEST_MENU_WIDTH_PX = 296;
	const ROOM_BELOW_MENU_PX = 340;

	let trigger = $state<Trigger | null>(null);
	let suggestions = $state<Suggestion[]>([]);
	let activeSuggestion = $state(0);
	let menuPos = $state<{ x: number; top?: number; bottom?: number }>({ x: 0 });
	let closedAt = -1;
	let asked = 0;

	const participants = $derived(
		[peek.author, ...peek.timeline.map((e) => e.who), ...(peek.pr?.reviews ?? []).map((r) => r.who)]
			.reverse()
			.map((who): UserSuggestion => ({
				kind: 'user',
				login: who.login,
				name: null,
				avatar: who.avatar ?? null,
				team: false
			}))
	);

	function placeMenu(el: HTMLTextAreaElement, t: Trigger) {
		const c = caretXY(el, t.start);
		const rect = el.getBoundingClientRect();
		const x = Math.max(8, Math.min(rect.left + c.x, window.innerWidth - SUGGEST_MENU_WIDTH_PX));
		const y = rect.top + c.y;
		menuPos =
			window.innerHeight - (y + c.line) > ROOM_BELOW_MENU_PX
				? { x, top: y + c.line + 4 }
				: { x, bottom: window.innerHeight - y + 4 };
	}

	function refsMatching(query: string) {
		const q = query.toLowerCase();
		return DEMO_REFS.filter(
			(r) =>
				!q ||
				String(r.number).startsWith(q) ||
				r.title
					.toLowerCase()
					.split(/\s+/)
					.some((w) => w.startsWith(q))
		);
	}

	function updateSuggestions() {
		const el = box;
		if (!el || el.selectionStart !== el.selectionEnd) return closeSuggestions();
		const t = triggerAt(draft, el.selectionStart);
		if (!t) closedAt = -1;
		if (!t || t.start === closedAt) return closeSuggestions();
		if (!trigger || trigger.kind !== t.kind || trigger.start !== t.start) activeSuggestion = 0;
		trigger = t;
		placeMenu(el, t);
		const n = ++asked;
		if (t.kind === 'user')
			suggestions = rankUsers(participants, DEMO_PEOPLE, t.query, DEMO_ME.login);
		else if (t.kind === 'ref') suggestions = rankRefs(refsMatching(t.query), t.query);
		else
			loadEmojiList().then((list) => {
				if (n === asked) suggestions = rankEmoji(list, t.query);
			});
		activeSuggestion = Math.min(activeSuggestion, Math.max(0, suggestions.length - 1));
	}

	async function expandClosedShortcode() {
		const el = box;
		if (!el || el.selectionStart !== el.selectionEnd) return;
		const caret = el.selectionStart;
		const closed = closedShortcodeBefore(draft, caret);
		if (!closed) return;
		const typed = draft;
		const emoji = emojiForShortcode(await loadEmojiList(), closed.shortcode);
		if (!emoji || draft !== typed) return;
		const r = replaceWithEmoji(draft, caret, closed.start, emoji);
		draft = r.text;
		await tick();
		el.setSelectionRange(r.caret, r.caret);
	}

	function closeSuggestions() {
		trigger = null;
		suggestions = [];
		asked++;
	}

	async function pickSuggestion(s: Suggestion) {
		const el = box;
		if (!el || !trigger) return;
		const r = applyPick(draft, el.selectionStart, trigger, s);
		draft = r.text;
		closeSuggestions();
		await tick();
		el.focus();
		el.setSelectionRange(r.caret, r.caret);
	}

	function suggestionKey(e: KeyboardEvent) {
		if (!trigger || e.isComposing) return false;
		if (e.key === 'Escape') {
			closedAt = trigger.start;
			closeSuggestions();
			return true;
		}
		if (!suggestions.length) return false;
		const count = suggestions.length;
		if (e.key === 'ArrowDown') activeSuggestion = (activeSuggestion + 1) % count;
		else if (e.key === 'ArrowUp') activeSuggestion = (activeSuggestion - 1 + count) % count;
		else if (e.key === 'Enter' || e.key === 'Tab')
			void pickSuggestion(suggestions[activeSuggestion]);
		else return false;
		return true;
	}

	function onBoxKey(e: KeyboardEvent) {
		if (suggestionKey(e)) {
			e.preventDefault();
			e.stopPropagation();
			return;
		}
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			send();
		}
	}
</script>

<div class="flex h-11 shrink-0 items-center gap-1 border-b px-2">
	<span class="hidden px-2 text-xs text-muted-foreground lg:inline"
		><kbd class="font-sans">J</kbd>/<kbd class="font-sans">K</kbd> to move{#if place === 'inbox'}{' '}·
			<kbd class="font-sans">E</kbd> done · <kbd class="font-sans">S</kbd> snooze{/if}</span
	>
	<span class="ml-auto flex items-center gap-1">
		<button
			type="button"
			class={buttonClass('ghost', 'icon-sm')}
			aria-label="Open on GitHub"
			onclick={onopen}><ExternalLink /></button
		>
		<button
			type="button"
			class={buttonClass('ghost', 'icon-sm', 'demo-close')}
			aria-label="Close peek"
			onclick={onclose}><X /></button
		>
	</span>
</div>

<div class="min-h-0 flex-1 overflow-y-auto">
	<div class="flex items-start gap-2 border-b px-4 py-3 text-sm">
		<p class="min-w-0 flex-1 leading-snug">
			<span class="font-medium">{lead}:</span>
			{text}
		</p>
	</div>
	{#if changes.length}
		<div class="flex flex-wrap items-center gap-1.5 border-b px-4 py-2 text-xs">
			<span class="text-muted-foreground">Since you looked:</span>
			{#each changes as change (change.text)}
				<span
					class={cx(
						'rounded-md px-1.5 py-0.5',
						change.tone === 'good' ? 'bg-signal-merge/10 text-signal-merge' : 'bg-muted'
					)}>{change.text}</span
				>
			{/each}
		</div>
	{/if}

	<article class="grid gap-5 p-4 pb-6">
		<header class="grid gap-2">
			<div class="flex flex-wrap items-center gap-2 text-xs">
				{#key peek.state}
					{@const StateIcon = stateIcon}
					<span
						class={cx(
							'flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
							STATE[peek.state].tone
						)}><StateIcon class="size-3.5" />{STATE[peek.state].label}</span
					>
				{/key}
				<span class="font-mono text-muted-foreground">{reference}</span>
			</div>
			<h3 class="text-base leading-snug font-semibold text-balance">{title}</h3>
			<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
				<span class="flex items-center gap-1.5"
					><MockAvatar person={peek.author} size={1} /><span class="text-foreground"
						>{peek.author.login}</span
					></span
				>
				<span>opened {peek.opened}</span>
				{#if peek.pr}
					<span class="opacity-50">·</span>
					<span class="text-signal-merge tabular-nums">+{peek.pr.additions}</span>
					<span class="text-signal-fail tabular-nums">−{peek.pr.deletions}</span>
					<span>{peek.pr.files} files</span>
				{/if}
			</div>
			{#if peek.pr}
				<p class="truncate font-mono text-[0.7rem] text-muted-foreground">
					{peek.pr.base} ← {peek.pr.head}
				</p>
			{/if}
			{#if peek.labels?.length}
				<div class="flex flex-wrap gap-1">
					{#each peek.labels as label (label)}
						<span class="rounded-full border px-2 py-0.5 text-[0.7rem]">{label}</span>
					{/each}
				</div>
			{/if}
		</header>

		{#if peek.pr}
			{@const pr = peek.pr}
			<section class="grid gap-3 rounded-xl border p-3 text-[0.8rem]">
				<div class="grid gap-1.5">
					<h4 class="text-xs font-medium text-muted-foreground">Reviews</h4>
					{#each pr.reviews as review (review.who.login)}
						<div class="flex items-center gap-2">
							<MockAvatar person={review.who} size={1.25} />
							<span class="truncate">{review.who.login}</span>
							<span class={cx('ml-auto shrink-0', REVIEW[review.state].tone)}
								>{REVIEW[review.state].label}</span
							>
						</div>
					{/each}
				</div>
				{#if pr.openThreads}
					<p class="flex items-center gap-2 border-t pt-3 text-signal-reply">
						<MessageSquare class="size-4" />{pr.openThreads} review threads are not resolved.
					</p>
				{/if}
				<div class="grid gap-1.5 border-t pt-3">
					<h4 class="flex flex-wrap items-center gap-x-2 text-xs font-medium text-muted-foreground">
						Checks
						{#each checkCounts as { state, n } (state)}
							<span class={cx('font-normal', CHECK[state].tone)}>{n} {CHECK[state].label}</span>
						{/each}
					</h4>
					{#each pr.checks.filter((c) => c.state !== 'success') as check (check.name)}
						{@const ci = CHECK[check.state]}
						<span class="-mx-1 flex items-center gap-2 rounded-md px-1 py-0.5">
							<ci.icon class={cx('size-4 shrink-0', ci.tone)} />
							<span class="truncate">{check.name}</span>
						</span>
					{/each}
				</div>
			</section>
		{/if}

		<section class="text-[0.85rem] leading-relaxed">{peek.body}</section>

		{#if peek.timeline.length}
			<section class="grid gap-3">
				<h4 class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
					<MessageSquare class="size-3.5" />Activity
				</h4>
				{#each peek.timeline as entry, i (i)}
					<div class="grid gap-1.5">
						<div class="flex items-center gap-2 text-xs">
							<MockAvatar person={entry.who} size={1.25} />
							<span class="truncate font-medium">{entry.who.login}</span>
							<span
								class={cx(
									'shrink-0 text-muted-foreground',
									entry.tone === 'good' && 'text-signal-merge',
									entry.tone === 'bad' && 'text-signal-fail'
								)}>{entry.verb}</span
							>
							<span class="ml-auto shrink-0 text-muted-foreground tabular-nums">{entry.ago}</span>
						</div>
						{#if entry.text}
							<p class="ml-7 rounded-lg bg-muted/50 px-3 py-2 text-[0.85rem]">{entry.text}</p>
						{/if}
					</div>
				{/each}
			</section>
		{/if}

		{#if canComment && isOpen}
			<div class="grid gap-1.5">
				<textarea
					bind:this={box}
					bind:value={draft}
					onkeydown={onBoxKey}
					oninput={() => {
						updateSuggestions();
						void expandClosedShortcode();
					}}
					onclick={updateSuggestions}
					onblur={closeSuggestions}
					aria-autocomplete="list"
					rows="2"
					aria-label="Comment on {reference}"
					placeholder="Leave a comment. @ mentions, # issues, : emoji"
					class="w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-[0.85rem] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
				></textarea>
				{#if trigger && (suggestions.length || (trigger.query && trigger.kind !== 'emoji'))}
					<SuggestMenu
						items={suggestions}
						active={activeSuggestion}
						loading={false}
						pos={menuPos}
						onpick={pickSuggestion}
						onhover={(i) => (activeSuggestion = i)}
					/>
				{/if}
				<div class="flex items-center gap-2 text-xs text-muted-foreground">
					<span>{draft.trim() ? 'Draft saved' : '⌘↵ to send'}</span>
					<button
						type="button"
						class={buttonClass(mode === 'comment' ? 'outline' : 'default', 'xs', 'ml-auto')}
						disabled={!draft.trim() && mode !== 'approve'}
						onclick={send}>{SEND_LABEL[mode]}</button
					>
				</div>
			</div>
		{/if}
	</article>
</div>

<div class="relative flex shrink-0 flex-wrap items-center gap-1 border-t p-2">
	{#if place === 'inbox'}
		<button type="button" class={buttonClass('ghost', 'sm')} aria-label="Done" onclick={ondone}
			><Check /><span class="max-sm:sr-only">Done</span></button
		>
		<button
			type="button"
			class={buttonClass('ghost', 'sm')}
			aria-label="Snooze until tomorrow 9:00"
			onclick={onsnooze}><AlarmClock /><span class="max-sm:sr-only">Snooze</span></button
		>
		<button type="button" class={buttonClass('ghost', 'sm')} aria-label="Mute" onclick={onmute}
			><BellOff /><span class="max-sm:sr-only">Mute</span></button
		>
	{:else if place === 'away'}
		<button type="button" class={buttonClass('ghost', 'sm')} onclick={onrestore}
			><Undo />Move to inbox</button
		>
	{:else}
		<button type="button" class={buttonClass('ghost', 'sm')} onclick={onhide}
			><EyeOff /><span class="max-sm:sr-only">Hide until it changes</span></button
		>
	{/if}

	{#if canComment && isOpen}
		<div class="ml-auto flex items-center gap-1.5" role="group" aria-label="Actions on GitHub">
			<div class="relative">
				<button
					type="button"
					class={buttonClass('outline', 'sm')}
					aria-expanded={moreOpen}
					onclick={() => (moreOpen = !moreOpen)}>More<ChevronDown class="opacity-60" /></button
				>
				{#if moreOpen}
					<div
						class="absolute right-0 bottom-full z-10 mb-1 grid w-56 rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md"
					>
						{#if peek.kind === 'pr'}
							<button
								type="button"
								class="flex items-center rounded-md px-2 py-1.5 text-left hover:bg-muted"
								onclick={() => startComment('approve')}
								>Approve with a comment…<kbd
									class="ml-auto pl-3 font-sans text-xs text-muted-foreground">A</kbd
								></button
							>
							<button
								type="button"
								class="flex items-center rounded-md px-2 py-1.5 text-left hover:bg-muted"
								onclick={() => startComment('changes')}
								>Request changes…<kbd class="ml-auto pl-3 font-sans text-xs text-muted-foreground"
									>⇧A</kbd
								></button
							>
						{/if}
						<button
							type="button"
							class="flex items-center rounded-md px-2 py-1.5 text-left hover:bg-muted"
							onclick={() => startComment('comment')}
							>Comment<kbd class="ml-auto pl-3 font-sans text-xs text-muted-foreground">⇧C</kbd
							></button
						>
					</div>
				{/if}
			</div>
			{#if peek.main === 'approve'}
				<button
					type="button"
					class={buttonClass('default', 'sm')}
					disabled={approving}
					onclick={onapprove}
				>
					{#if approving}<LoaderCircle class="animate-spin" />Approving…{:else}Approve{/if}
				</button>
			{:else if peek.main === 'rerun' && (failing || rerunning)}
				<button
					type="button"
					class={buttonClass('default', 'sm')}
					disabled={rerunning}
					onclick={onrerun}
				>
					{#if rerunning}<LoaderCircle class="animate-spin" />Re-running…{:else}Re-run failed jobs{/if}
				</button>
			{:else if peek.main === 'merge'}
				<button
					type="button"
					class={buttonClass(confirmingMerge ? 'destructive' : 'default', 'sm')}
					onclick={onmerge}>{confirmingMerge ? 'Confirm: merge' : 'Merge'}</button
				>
			{/if}
		</div>
	{/if}
</div>
