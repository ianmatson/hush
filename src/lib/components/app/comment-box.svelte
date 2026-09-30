<script lang="ts">
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { commandFor, keysOf } from '$lib/keys.svelte';
	import {
		acting,
		approveLater,
		composer,
		sendAction,
		type ComposeIntent
	} from '$lib/gh-act.svelte';
	import { GH_ACTIONS, ghActions } from '$lib/shared/actions';
	import type { PeekDTO } from '$lib/shared/types';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { createQuery } from '@tanstack/svelte-query';
	import { api } from '$lib/api';
	import { caretXY } from '$lib/caret';
	import { meQuery, queryClient } from '$lib/queries';
	import {
		applyPick,
		rankRefs,
		rankUsers,
		triggerAt,
		type RefSuggestion,
		type Suggestion,
		type Trigger,
		type UserSuggestion
	} from '$lib/shared/suggest';
	import SuggestMenu from './suggest-menu.svelte';

	/**
	 * The comment box at the end of the conversation, as on GitHub. On a PR you can review, the
	 * text can also go with an approval or a change request. The bar and the keys focus it
	 * (focusComposer); ⌘ Enter does what you came for.
	 */
	let { p }: { p: PeekDTO } = $props();

	const states = $derived(ghActions(p));
	const can = (id: 'approve' | 'request_changes') => {
		const s = states.find((x) => x.id === id);
		return !!s && !s.blocked;
	};
	const review = $derived(can('approve') || can('request_changes'));

	let text = $state('');
	let box = $state<HTMLTextAreaElement | null>(null);
	let wrap = $state<HTMLElement | null>(null);

	// Focus it when the bar, a key, or the palette asks.
	let seen = composer.focus;
	$effect(() => {
		const n = composer.focus;
		if (n === seen) return;
		seen = n;
		tick().then(() => {
			wrap?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
			box?.focus({ preventScroll: true });
		});
	});

	async function submit(intent: ComposeIntent) {
		const body = text.trim();
		if (intent !== 'approve' && !body) return void box?.focus();
		if (intent === 'approve') approveLater(p, body || undefined);
		else if (!(await sendAction(p, intent, { body }))) return;
		else toast.success(GH_ACTIONS[intent].done, { description: `${p.repo}#${p.number}` });
		text = '';
		composer.intent = 'comment';
	}

	// --- "@" and "#" suggestions, as on GitHub (shared/suggest.ts) ---------------------------
	const me = createQuery(meQuery);
	let trigger = $state<Trigger | null>(null);
	/** Esc closes the list until you type somewhere else. */
	let closedAt = -1;
	let items = $state<Suggestion[]>([]);
	let loading = $state(false);
	let active = $state(0);
	/** Where the list goes on screen: under the caret, or over it when there is no room below. */
	let pos = $state<{ x: number; top?: number; bottom?: number }>({ x: 0 });
	let asked = 0;

	/** The conversation's people: the author, then the latest to speak, reviewers, assignees. */
	const participants = $derived.by((): UserSuggestion[] => {
		const u = (login: string, avatar: string | null = null): UserSuggestion => ({
			kind: 'user',
			login,
			name: null,
			avatar,
			team: false
		});
		return [
			u(p.author.login, p.author.avatar),
			...[...p.timeline.items].reverse().map((e) => u(e.author.login, e.author.avatar)),
			...(p.pr?.reviews ?? []).map((r) => u(r.who.login, r.who.avatar)),
			...(p.pr?.requested ?? []).filter((r) => !r.team).map((r) => u(r.name)),
			...p.assignees.map((a) => u(a))
		].filter((x) => x.login !== 'ghost');
	});

	const suggestKey = (t: Trigger) =>
		[
			'suggest',
			t.kind === 'ref' && t.repo ? t.repo : p.repo,
			t.kind,
			t.query.toLowerCase()
		] as const;

	function fetchSuggestions(t: Trigger) {
		const repo = t.kind === 'ref' && t.repo ? t.repo : p.repo;
		// Only the words so far: the list waits for a short pause (GitHub limits searches).
		return queryClient.fetchQuery({
			queryKey: suggestKey(t),
			queryFn: () => api.suggest(repo, t.kind, t.query, p.repo).then((r) => r.items),
			staleTime: 5 * 60_000
		});
	}

	function place(el: HTMLTextAreaElement, t: Trigger) {
		const c = caretXY(el, t.start);
		const rect = el.getBoundingClientRect();
		const x = Math.max(8, Math.min(rect.left + c.x, window.innerWidth - 296));
		const y = rect.top + c.y;
		pos =
			window.innerHeight - (y + c.line) > 340
				? { x, top: y + c.line + 4 }
				: { x, bottom: window.innerHeight - y + 4 };
	}

	// A scroll of the peek moves the caret: the list follows it.
	$effect(() => {
		const follow = () => {
			if (trigger && box) place(box, trigger);
		};
		document.addEventListener('scroll', follow, true);
		window.addEventListener('resize', follow);
		return () => {
			document.removeEventListener('scroll', follow, true);
			window.removeEventListener('resize', follow);
		};
	});

	let timer: ReturnType<typeof setTimeout> | undefined;
	function update() {
		const el = box;
		if (!el || el.selectionStart !== el.selectionEnd) return close();
		const t = triggerAt(text, el.selectionStart);
		if (!t) closedAt = -1;
		if (!t || t.start === closedAt) return close();
		const same = trigger && trigger.kind === t.kind && trigger.start === t.start;
		if (!same) active = 0;
		trigger = t;
		place(el, t);
		const mine = (u: Suggestion[]) =>
			t.kind === 'user'
				? rankUsers(participants, u as UserSuggestion[], t.query, me.data?.login ?? '')
				: rankRefs(u as RefSuggestion[], t.query);
		// Saved answers and the conversation's people show at once; the rest after the answer.
		const saved = queryClient.getQueryData<Suggestion[]>(suggestKey(t));
		if (saved) items = mine(saved);
		else if (t.kind === 'user') items = mine(same ? items : []);
		else if (!same) items = [];
		const n = ++asked;
		loading = true;
		clearTimeout(timer);
		timer = setTimeout(
			() =>
				fetchSuggestions(t)
					.then((found) => {
						if (n !== asked) return;
						items = mine(found as Suggestion[]);
						active = Math.min(active, Math.max(0, items.length - 1));
					})
					.catch(() => {})
					.finally(() => {
						if (n === asked) loading = false;
					}),
			t.query ? 150 : 0
		);
	}

	function close() {
		trigger = null;
		items = [];
		asked++;
		clearTimeout(timer);
	}

	async function pick(s: Suggestion) {
		const el = box;
		if (!el || !trigger) return;
		const r = applyPick(text, el.selectionStart, trigger, s);
		text = r.text;
		close();
		await tick();
		el.focus();
		el.setSelectionRange(r.caret, r.caret);
	}

	/** A key for the open list; false when the list is closed or the key is not one of its keys. */
	function listKey(e: KeyboardEvent): boolean {
		if (!trigger || e.isComposing) return false;
		const cmd = commandFor(e, ['editor']);
		if (cmd === 'editor.suggestClose') {
			closedAt = trigger.start;
			close();
			return true;
		}
		if (!items.length) return false;
		if (cmd === 'editor.suggestNext') active = (active + 1) % items.length;
		else if (cmd === 'editor.suggestPrev') active = (active - 1 + items.length) % items.length;
		else if (cmd === 'editor.suggestPick') void pick(items[active]);
		else return false;
		return true;
	}

	const placeholder = $derived(
		composer.intent === 'request_changes'
			? 'What should change?'
			: composer.intent === 'approve'
				? 'Leave a comment with your approval (optional)'
				: 'Leave a comment'
	);
</script>

{#if p.can.comment}
	<form
		bind:this={wrap}
		class="grid gap-2 border-t pt-4"
		onsubmit={(e) => {
			e.preventDefault();
			submit(composer.intent);
		}}
	>
		<div>
			<Textarea
				bind:ref={box}
				bind:value={text}
				class="min-h-20 text-sm"
				{placeholder}
				aria-label="Comment"
				aria-autocomplete="list"
				aria-expanded={!!trigger}
				oninput={update}
				onclick={update}
				onkeyup={(e) => {
					if (
						e.key === 'ArrowLeft' ||
						e.key === 'ArrowRight' ||
						e.key === 'Home' ||
						e.key === 'End'
					)
						update();
				}}
				onblur={close}
				onkeydown={(e) => {
					if (listKey(e)) {
						e.preventDefault();
						return;
					}
					if (commandFor(e, ['editor']) === 'editor.send') {
						e.preventDefault();
						submit(composer.intent);
					} else if (e.key === 'Escape') {
						e.preventDefault();
						box?.blur();
					}
				}}
			/>
			{#if trigger && (items.length || loading || trigger.query)}
				<SuggestMenu {items} {active} {loading} {pos} onpick={pick} onhover={(i) => (active = i)} />
			{/if}
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-xs text-muted-foreground"
				>Markdown · {keysOf('editor.send')[0] ?? ''} to send</span
			>
			<span class="flex-1"></span>
			{#if review && can('request_changes')}
				<Button
					type="button"
					size="sm"
					variant={composer.intent === 'request_changes' ? 'destructive' : 'ghost'}
					disabled={!!acting.id || !text.trim()}
					onclick={() => submit('request_changes')}>Request changes</Button
				>
			{/if}
			{#if review && can('approve')}
				<Button
					type="button"
					size="sm"
					variant={composer.intent === 'approve' ? 'default' : 'outline'}
					disabled={!!acting.id}
					onclick={() => submit('approve')}>Approve</Button
				>
			{/if}
			<Button
				type="button"
				size="sm"
				variant={composer.intent === 'comment' ? 'default' : 'outline'}
				disabled={!!acting.id || !text.trim()}
				onclick={() => submit('comment')}
			>
				{#if acting.id === 'comment'}<LoaderCircle class="animate-spin" />{/if}Comment
			</Button>
		</div>
	</form>
{/if}
