<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { MediaQuery, SvelteSet } from 'svelte/reactivity';
	import { flip } from 'svelte/animate';
	import { fade, fly, slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { toast } from 'svelte-sonner';
	import { createQueries, createQuery } from '@tanstack/svelte-query';
	import { api, type ThreadAction } from '$lib/api';
	import { keys, meQuery, queryClient, setCounts, threadsQuery } from '$lib/queries';
	import { Selection } from '$lib/selection.svelte';
	import type { Counts, SavedView, ThreadDTO, View, ViewBase } from '$lib/shared/types';
	import { VIEW_BASES, textMatches, viewMatches } from '$lib/shared/views';
	import { saveSettings } from '$lib/save-settings';
	import ViewEditor from '$lib/components/app/view-editor.svelte';
	import ViewTabs, { type ViewTab } from '$lib/components/app/view-tabs.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Pencil from '@lucide/svelte/icons/pencil';
	import BookmarkPlus from '@lucide/svelte/icons/bookmark-plus';
	import { ago, snoozeOptions } from '$lib/time';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Alert from '$lib/components/ui/alert';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Kbd } from '$lib/components/ui/kbd';
	import ThreadRow from '$lib/components/app/thread-row.svelte';
	import BulkBar from '$lib/components/app/bulk-bar.svelte';
	import SnoozeItems from '$lib/components/app/snooze-items.svelte';
	import SnoozeSheet from '$lib/components/app/snooze-sheet.svelte';
	import Peek from '$lib/components/app/peek.svelte';
	import AppMenu from '$lib/components/app/app-menu.svelte';
	import { buildMenu, type MenuEntry } from '$lib/menu';
	import { DEFAULT_MENUS, MENU_ITEMS } from '$lib/shared/menus';
	import type { Component } from 'svelte';
	import { alreadyTrue, eventsFor, subjectKind } from '$lib/shared/snooze';
	import { palette, type PaletteCommand } from '$lib/palette.svelte';
	import { openOnGitHub } from '$lib/recheck';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Search from '@lucide/svelte/icons/search';
	import Keyboard from '@lucide/svelte/icons/keyboard';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Check from '@lucide/svelte/icons/check';
	import AlarmClock from '@lucide/svelte/icons/alarm-clock';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import Undo from '@lucide/svelte/icons/undo-2';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Link from '@lucide/svelte/icons/link';
	import MailOpen from '@lucide/svelte/icons/mail-open';
	import Mail from '@lucide/svelte/icons/mail';
	import SquareCheck from '@lucide/svelte/icons/square-check';
	import PanelRightOpen from '@lucide/svelte/icons/panel-right-open';
	import Zap from '@lucide/svelte/icons/zap';
	import ListFilter from '@lucide/svelte/icons/list-filter';

	type ThreadsData = { threads: ThreadDTO[]; counts: Counts };

	const VIEWS: { id: View; label: string }[] = [
		{ id: 'action', label: 'Needs you' },
		{ id: 'fyi', label: 'FYI' },
		{ id: 'snoozed', label: 'Snoozed' },
		{ id: 'done', label: 'Done' },
		{ id: 'muted', label: 'Muted' }
	];
	const BULK_MAX = 20;
	const FLIP = { duration: 220, easing: cubicOut };

	const me = createQuery(meQuery);
	const viewParam = $derived(page.url.searchParams.get('view') || 'action');
	const savedViews = $derived(me.data?.settings.views ?? []);
	/** The saved view on screen, when the tab is one (?view=v:<id>). */
	const saved = $derived(
		viewParam.startsWith('v:') ? (savedViews.find((v) => `v:${v.id}` === viewParam) ?? null) : null
	);
	/** The list the page shows and acts on: a built-in view, or the saved view's base. */
	const view = $derived<View>(
		saved ? saved.base : viewParam.startsWith('v:') ? 'action' : (viewParam as View)
	);
	const inInbox = $derived(view === 'action' || view === 'fyi' || view === 'inbox');
	const threadsQ = createQuery(() => threadsQuery(view));
	// The base lists of the saved views, for their tab counts (D1 only, usually a 304).
	const bases = $derived([...new Set(savedViews.map((v) => v.base))]);
	const baseLists = createQueries(() => ({ queries: bases.map((b) => threadsQuery(b)) }));
	const baseThreads = $derived(
		Object.fromEntries(bases.map((b, k) => [b, baseLists[k]?.data?.threads])) as Partial<
			Record<ViewBase, ThreadDTO[]>
		>
	);
	// While a tab's list loads, its counts keep the last known numbers (no badges that go away).
	const lastViewCounts: Record<string, number> = {};
	const viewCount = (v: SavedView) => {
		const n = baseThreads[v.base]?.filter((t) => viewMatches(v, t, me.data?.login ?? '')).length;
		if (n !== undefined) lastViewCounts[v.id] = n;
		return lastViewCounts[v.id] ?? null;
	};
	let lastCounts: Counts = { action: 0, fyi: 0, snoozed: 0 };
	const counts = $derived.by(() => (lastCounts = threadsQ.data?.counts ?? lastCounts));

	let syncing = $state(false);
	let query = $state('');
	let selectedId = $state<string | null>(null);
	let helpOpen = $state(false);
	let bulkSnoozeOpen = $state(false);
	let searchEl = $state<HTMLInputElement | null>(null);
	// Threads with a triage request in flight. A refetch must not bring them back.
	const pending = new SvelteSet<string>();
	const sel = new Selection();

	const visible = $derived.by(() => {
		const login = me.data?.login ?? '';
		return (threadsQ.data?.threads ?? []).filter(
			(t) => !pending.has(t.id) && (!saved || viewMatches(saved, t, login)) && textMatches(t, query)
		);
	});
	const order = $derived(visible.map((t) => t.id));
	const selectedIndex = $derived(visible.findIndex((t) => t.id === selectedId));
	const byId = (id: string) => visible.find((t) => t.id === id);

	// Keep a valid cursor and selection when the list changes.
	$effect(() => {
		if (!visible.some((t) => t.id === selectedId)) selectedId = visible[0]?.id ?? null;
		untrack(() => sel.prune(order));
	});
	// --- Peek: follows the cursor while open ----------------------------------------------
	let peekOpen = $state(false);
	let peekSnoozeOpen = $state(false);
	const wide = new MediaQuery('min-width: 1024px');
	// Read the cursor row even while closed: a derived whose dependencies change between runs
	// (only `peekOpen` while closed) missed later cursor moves.
	const peekThread = $derived.by(() => {
		const row = visible[selectedIndex] ?? null;
		return peekOpen ? row : null;
	});
	const peekTarget = $derived(
		peekThread && {
			repo: peekThread.repo,
			number: peekThread.number,
			title: peekThread.title,
			url: peekThread.htmlUrl
		}
	);
	// The list became empty (or changed view) while peeking.
	$effect(() => {
		if (peekOpen && !peekThread) peekOpen = false;
	});
	// Reading it in the peek counts as reading it, once it stays open for a moment.
	$effect(() => {
		const t = peekThread;
		if (!t?.unread || !t.number || me.data?.settings.peekMarksRead === false) return;
		const timer = setTimeout(() => act([t.id], 'read'), 1500);
		return () => clearTimeout(timer);
	});
	function peek(t: ThreadDTO) {
		selectedId = t.id;
		peekOpen = true;
	}

	// A new view starts with nothing selected.
	$effect(() => {
		void view;
		untrack(() => {
			sel.clear();
			peekOpen = false;
		});
	});
	// The command palette chose a thread in this view: peek it. (After the view effect above,
	// which closes the peek.)
	$effect(() => {
		const r = palette.peekRequest;
		const list = threadsQ.data?.threads;
		if (!r || r.page !== 'inbox' || r.view !== view || !list) return;
		untrack(() => {
			palette.peekRequest = null;
			if (!list.some((t) => t.id === r.id)) return;
			query = '';
			sel.clear();
			selectedId = r.id;
			peekOpen = true;
		});
	});

	async function sync() {
		syncing = true;
		try {
			const status = await api.sync();
			if (status.lastError) toast.error(status.lastError);
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: keys.threadsAll }),
				queryClient.invalidateQueries({ queryKey: keys.me })
			]);
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			syncing = false;
		}
	}

	const UNDO: Partial<Record<ThreadAction, ThreadAction>> = {
		done: 'undone',
		snooze: 'unsnooze',
		mute: 'unmute'
	};
	const LABEL: Partial<Record<ThreadAction, string>> = {
		done: 'Marked as done',
		snooze: 'Snoozed',
		mute: 'Muted. GitHub stops notifying you about these threads.',
		undone: 'Moved to inbox',
		unsnooze: 'Moved to inbox',
		unmute: 'Unmuted',
		read: 'Marked as read',
		unread: 'Marked as unread'
	};

	/** Send an action for many threads, 20 per request. */
	async function run(ids: string[], action: ThreadAction, body?: unknown) {
		for (let i = 0; i < ids.length; i += BULK_MAX) {
			const res = await api.actMany(ids.slice(i, i + BULK_MAX), action, body);
			setCounts(res.counts);
		}
		// Other views changed too; refetch them when they are next used.
		queryClient.invalidateQueries({ queryKey: keys.threadsAll });
	}

	async function act(ids: string[], action: ThreadAction, body?: unknown) {
		if (!ids.length) return;
		const threads = ids.map(byId).filter((t): t is ThreadDTO => !!t);
		if (action === 'read' || action === 'unread') {
			// Stays in the list; only the marker changes.
			const unread = action === 'unread';
			queryClient.setQueryData<ThreadsData>(keys.threads(view), (old) =>
				old
					? {
							...old,
							threads: old.threads.map((x) => (ids.includes(x.id) ? { ...x, unread } : x))
						}
					: old
			);
			run(ids, action).catch((e) => toast.error(e.message));
			if (ids.length > 1) toast(LABEL[action]!, { description: `${ids.length} threads` });
			return;
		}
		// Optimistic: the rows leave this view now. Stop any refetch that could bring them back.
		const gone = new Set(ids);
		const after = visible.slice(Math.max(0, selectedIndex)).find((t) => !gone.has(t.id));
		const before = [...visible.slice(0, Math.max(0, selectedIndex))]
			.reverse()
			.find((t) => !gone.has(t.id));
		if (selectedId && gone.has(selectedId)) selectedId = (after ?? before)?.id ?? null;
		for (const id of ids) pending.add(id);
		sel.clear();
		await queryClient.cancelQueries({ queryKey: keys.threads(view) });
		queryClient.setQueryData<ThreadsData>(keys.threads(view), (old) =>
			old ? { ...old, threads: old.threads.filter((x) => !gone.has(x.id)) } : old
		);
		try {
			await run(ids, action, body);
			const undo = UNDO[action];
			toast(LABEL[action] ?? 'Done', {
				description: threads.length === 1 ? threads[0].title : `${threads.length} threads`,
				action: undo
					? { label: 'Undo', onClick: () => run(ids, undo).catch((e) => toast.error(e.message)) }
					: undefined
			});
		} catch (err) {
			toast.error((err as Error).message);
			queryClient.invalidateQueries({ queryKey: keys.threads(view) });
		} finally {
			for (const id of ids) pending.delete(id);
		}
	}

	/** Rows an action applies to: the selection, or else the cursor row. */
	const targets = () => sel.targets(order, selectedId);

	/**
	 * Read/unread toggle (like Gmail): if any of the threads is unread, mark them all read;
	 * otherwise mark them all unread.
	 */
	const readAction = (ids: string[]): 'read' | 'unread' =>
		ids.some((id) => byId(id)?.unread) ? 'read' : 'unread';
	const toggleRead = (ids: string[]) => ids.length && act(ids, readAction(ids));

	function open(t: ThreadDTO, url: string) {
		openOnGitHub(url);
		if (t.unread) act([t.id], 'read');
	}

	async function copyLinks(ids: string[]) {
		const urls = ids
			.map(byId)
			.filter(Boolean)
			.map((t) => t!.htmlUrl);
		await navigator.clipboard.writeText(urls.join('\n'));
		toast.success(urls.length === 1 ? 'Link copied' : `${urls.length} links copied`);
	}

	function onRowClick(e: MouseEvent, t: ThreadDTO) {
		if (sel.click(e, t.id, order, selectedId)) return;
		// A click on the card peeks it (PRs and issues; other threads only get the cursor).
		sel.clear();
		selectedId = t.id;
		if (t.number) peekOpen = true;
	}

	function onToggle(e: MouseEvent, t: ThreadDTO) {
		if (e.shiftKey) sel.range(order, t.id, selectedId);
		else sel.toggle(t.id);
		selectedId = t.id;
	}

	function move(delta: number, extend = false) {
		if (!visible.length) return;
		if (extend && selectedId) sel.ids.add(selectedId);
		const i =
			selectedIndex < 0 ? 0 : Math.min(Math.max(selectedIndex + delta, 0), visible.length - 1);
		selectedId = visible[i].id;
		if (extend) sel.ids.add(selectedId);
	}

	function onKey(e: KeyboardEvent) {
		const target = e.target;
		if (
			target instanceof Element &&
			target.closest('input, textarea, [contenteditable], [role="menu"], [role="dialog"]')
		) {
			if (e.key === 'Escape' && target === searchEl) searchEl?.blur();
			return;
		}
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
			e.preventDefault();
			sel.all(order);
			return;
		}
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		const t = visible[selectedIndex];
		const keys: Record<string, () => void> = {
			j: () => move(1),
			ArrowDown: () => move(1),
			k: () => move(-1),
			ArrowUp: () => move(-1),
			J: () => move(1, true),
			K: () => move(-1, true),
			x: () => t && sel.toggle(t.id),
			' ': () => t && (peekOpen = !peekOpen),
			Escape: () => (peekOpen ? (peekOpen = false) : sel.clear()),
			o: () => t && open(t, t.actionUrl),
			Enter: () => t && open(t, t.actionUrl),
			O: () => t && open(t, t.htmlUrl),
			e: () => inInbox && act(targets(), 'done'),
			s: () => inInbox && act(targets(), 'snooze', { until: snoozeOptions()[2].until }),
			m: () => inInbox && act(targets(), 'mute'),
			c: () => copyLinks(targets()),
			u: () => toggleRead(targets()),
			r: () => sync(),
			'/': () => searchEl?.focus(),
			'?': () => (helpOpen = true)
		};
		VIEWS.forEach((v, i) => (keys[String(i + 1)] = () => goto(`/?view=${v.id}`)));
		savedViews
			.slice(0, 4)
			.forEach((v, i) => (keys[String(VIEWS.length + i + 1)] = () => goto(`/?view=v:${v.id}`)));
		const fn = keys[e.key];
		if (fn) {
			e.preventDefault();
			fn();
		}
	}

	// --- Right-click menu: one menu for the whole list --------------------------------
	let menuIds = $state<string[]>([]);
	function onContextMenu(e: MouseEvent) {
		const id = (e.target as Element).closest<HTMLElement>('[data-row-id]')?.dataset.rowId;
		if (!id) {
			e.preventDefault();
			return;
		}
		// Right-click inside the selection acts on all of it; elsewhere, on that row only.
		if (!sel.has(id)) {
			sel.clear();
			selectedId = id;
		}
		menuIds = sel.size ? sel.targets(order, id) : [id];
	}

	// --- Menus (Settings → Menus): one list for the right-click and the phone "⋯" menus ---
	let menuSnoozeIds = $state<string[]>([]);
	let menuSnoozeOpen = $state(false);
	const itemLabel = (id: string) => MENU_ITEMS.inbox.find((i) => i.id === id)?.label ?? id;

	/** The menu for these threads, in your saved order, with only the items that apply. */
	function menuFor(ids: string[]): MenuEntry[] {
		const one = ids.length === 1 ? byId(ids[0]) : undefined;
		const n = (label: string) => (ids.length > 1 ? `${label} (${ids.length})` : label);
		const kinds = ids.map((id) => subjectKind(byId(id)?.subjectType ?? ''));
		const already = one ? alreadyTrue(one) : [];
		const events = eventsFor(kinds);
		const item = (
			key: string,
			label: string,
			icon: Component,
			run: () => void,
			shortcut?: string
		): MenuEntry => ({ type: 'item', key, label, icon, run, shortcut });
		const make = (id: string): MenuEntry | null => {
			switch (id) {
				case 'peek':
					return one?.number ? item(id, 'Peek', PanelRightOpen, () => peek(one), 'Space') : null;
				case 'main':
					return one
						? item(id, one.actionLabel, ExternalLink, () => open(one, one.actionUrl), '↵')
						: null;
				case 'github':
					return one && one.htmlUrl !== one.actionUrl
						? item(id, 'Open on GitHub', ExternalLink, () => open(one, one.htmlUrl), '⇧O')
						: null;
				case 'done':
					return inInbox ? item(id, n('Done'), Check, () => act(ids, 'done'), 'E') : null;
				case 'snooze':
					return inInbox
						? {
								type: 'snooze',
								key: id,
								label: n('Snooze'),
								icon: AlarmClock,
								subjects: kinds,
								disabled: already,
								onpick: (b) => act(ids, 'snooze', b),
								sheet: () => {
									menuSnoozeIds = ids;
									menuSnoozeOpen = true;
								}
							}
						: null;
				case 'mute':
					return inInbox ? item(id, n('Mute'), BellOff, () => act(ids, 'mute'), 'M') : null;
				case 'restore':
					return inInbox
						? null
						: item(id, n(view === 'muted' ? 'Unmute' : 'Move to inbox'), Undo, () =>
								act(ids, restoreAction(one))
							);
				case 'read': {
					const r = readAction(ids);
					return item(
						id,
						n(r === 'read' ? 'Mark as read' : 'Mark as unread'),
						r === 'read' ? MailOpen : Mail,
						() => act(ids, r),
						'U'
					);
				}
				case 'copy':
					return item(
						id,
						n(ids.length > 1 ? 'Copy links' : 'Copy link'),
						Link,
						() => copyLinks(ids),
						'C'
					);
				case 'rule':
					return one
						? item(id, 'Make a rule…', ListFilter, () =>
								goto(
									`/settings/inbox?rule=${encodeURIComponent(JSON.stringify({ repo: one.repo, type: [one.subjectType] }))}`
								)
							)
						: null;
				case 'select':
					return one
						? item(
								id,
								sel.has(one.id) ? 'Deselect' : 'Select',
								SquareCheck,
								() => sel.toggle(one.id),
								'X'
							)
						: null;
				case 'selectAll':
					return item(id, 'Select all', SquareCheck, () => sel.all(order), '⌘A');
			}
			if (!inInbox) return null;
			const time = snoozeOptions().find((o) => `snooze:${o.id}` === id);
			if (time)
				return item(id, n(itemLabel(id)), AlarmClock, () =>
					act(ids, 'snooze', { until: time.until })
				);
			const ev = events.find((e) => `until:${e.id}` === id);
			if (ev && !already.includes(ev.id))
				return item(id, n(itemLabel(id)), Zap, () => act(ids, 'snooze', { event: ev.id }));
			return null;
		};
		return buildMenu(me.data?.settings.menus.inbox ?? DEFAULT_MENUS.inbox, make);
	}
	const restoreAction = (t: ThreadDTO | undefined): ThreadAction =>
		view === 'muted' || t?.category === 'muted'
			? 'unmute'
			: view === 'snoozed'
				? 'unsnooze'
				: 'undone';

	// --- Command palette: actions on the cursor row or the selection ------------------------
	$effect(() =>
		palette.register(() => {
			const ids = targets();
			if (!ids.length) return [];
			const one = ids.length === 1 ? byId(ids[0]) : undefined;
			const detail = one ? one.title : `${ids.length} selected`;
			const cmds: PaletteCommand[] = [];
			const add = (c: Omit<PaletteCommand, 'detail'>) => cmds.push({ ...c, detail });
			if (one?.number)
				add({
					id: 'act:peek',
					label: 'Peek',
					icon: PanelRightOpen,
					shortcut: 'Space',
					run: () => peek(one)
				});
			if (one)
				add({
					id: 'act:open',
					label: one.actionLabel,
					icon: ExternalLink,
					shortcut: '↵',
					run: () => open(one, one.actionUrl)
				});
			if (inInbox) {
				add({
					id: 'act:done',
					label: 'Mark as done',
					icon: Check,
					shortcut: 'E',
					run: () => act(ids, 'done')
				});
				for (const o of snoozeOptions())
					add({
						id: `act:snooze:${o.label}`,
						label: /^\d/.test(o.label) ? `Snooze for ${o.label}` : `Snooze until ${o.label}`,
						icon: AlarmClock,
						run: () => act(ids, 'snooze', { until: o.until })
					});
				const already = one ? alreadyTrue(one) : [];
				for (const ev of eventsFor(ids.map((id) => subjectKind(byId(id)?.subjectType ?? ''))))
					if (!already.includes(ev.id))
						add({
							id: `act:snooze:${ev.id}`,
							label: `Snooze until ${ev.label.charAt(0).toLowerCase()}${ev.label.slice(1)}`,
							icon: Zap,
							keywords: ['snooze', 'wait'],
							run: () => act(ids, 'snooze', { event: ev.id })
						});
				add({
					id: 'act:mute',
					label: 'Mute',
					icon: BellOff,
					shortcut: 'M',
					run: () => act(ids, 'mute')
				});
			} else {
				add({
					id: 'act:restore',
					label: view === 'muted' ? 'Unmute' : 'Move to inbox',
					icon: Undo,
					run: () => act(ids, restoreAction(one))
				});
			}
			const read = readAction(ids);
			add({
				id: 'act:read',
				label: read === 'read' ? 'Mark as read' : 'Mark as unread',
				icon: read === 'read' ? MailOpen : Mail,
				shortcut: 'U',
				run: () => act(ids, read)
			});
			add({
				id: 'act:copy',
				label: ids.length > 1 ? 'Copy links' : 'Copy link',
				icon: Link,
				shortcut: 'C',
				run: () => copyLinks(ids)
			});
			add({
				id: 'act:all',
				label: 'Select all',
				icon: SquareCheck,
				shortcut: '⌘A',
				run: () => sel.all(order)
			});
			return cmds;
		})
	);

	// --- Saved views ------------------------------------------------------------------------
	// Settings → Inbox links here with &edit=1 to edit a view.
	$effect(() => {
		if (!saved || page.url.searchParams.get('edit') !== '1') return;
		const v = saved;
		untrack(() => {
			editView(v);
			goto(`/?view=v:${v.id}`, { replaceState: true, noScroll: true });
		});
	});
	const tabs = $derived<ViewTab[]>([
		...VIEWS.map((v) => ({
			key: v.id,
			href: `/?view=${v.id}`,
			label: v.label,
			count: count(v.id),
			strong: v.id === 'action',
			active: !saved && view === v.id
		})),
		...savedViews.map((v) => ({
			key: `v:${v.id}`,
			href: `/?view=v:${v.id}`,
			label: v.name,
			count: viewCount(v),
			active: saved?.id === v.id,
			saved: true
		}))
	]);
	let viewEditorOpen = $state(false);
	let viewEditing = $state<Omit<SavedView, 'id'> & { id?: string }>({
		name: '',
		base: 'inbox',
		when: {}
	});
	/** Open the editor: a view to edit, or a new one (from the current tab and filter text). */
	function editView(v: SavedView | null, fromQuery?: string) {
		viewEditing = v
			? structuredClone($state.snapshot(v))
			: {
					name: fromQuery ?? '',
					base:
						view === 'action' || view === 'fyi' || view === 'snoozed' || view === 'done'
							? view
							: 'inbox',
					query: fromQuery,
					when: {}
				};
		viewEditorOpen = true;
	}
	async function saveView(v: Omit<SavedView, 'id'> & { id?: string }) {
		const clean: SavedView = {
			...v,
			name: v.name.trim(),
			id: v.id ?? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
		};
		if (!clean.query?.trim()) delete clean.query;
		const views = v.id
			? savedViews.map((x) => (x.id === v.id ? clean : x))
			: [...savedViews, clean];
		if (await saveSettings({ views }, v.id ? 'View saved' : `View “${clean.name}” added`)) {
			viewEditorOpen = false;
			if (!v.id) {
				query = '';
				goto(`/?view=v:${clean.id}`);
			}
		}
	}
	async function deleteView(id: string) {
		if (await saveSettings({ views: savedViews.filter((x) => x.id !== id) }, 'View deleted')) {
			viewEditorOpen = false;
			goto('/?view=action');
		}
	}
	// Suggestions for the view's repository and author conditions.
	const viewSuggest = $derived.by(() => {
		const all = Object.values(baseThreads)
			.flatMap((l) => l ?? [])
			.concat(threadsQ.data?.threads ?? []);
		const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort();
		const repos = uniq(all.map((t) => t.repo));
		return {
			repo: [...uniq(repos.map((r) => `${r.split('/')[0]}/*`)), ...repos],
			author: uniq(all.map((t) => t.author)),
			label: uniq(all.flatMap((t) => t.labels))
		};
	});

	const count = (v: View) => (v === 'action' || v === 'fyi' || v === 'snoozed' ? counts[v] : null);

	const shortcuts = [
		['J / K', 'Next / previous'],
		['Shift + J / K', 'Extend the selection'],
		['Space', 'Peek (J / K move while it is open)'],
		['X', 'Select or deselect'],
		['⌘ / Ctrl + A', 'Select all'],
		['⌘ / Ctrl + click', 'Add to selection'],
		['Shift + click', 'Select a range'],
		['Enter / O', 'Main action (review, fix CI, reply…)'],
		['Shift + O', 'Open the thread on GitHub'],
		['E', 'Done'],
		['S', 'Snooze until tomorrow 9:00'],
		['M', 'Mute the thread'],
		['U', 'Mark as read / unread'],
		['C', 'Copy link'],
		['Esc', 'Clear the selection'],
		['R', 'Sync with GitHub now'],
		['/', 'Search'],
		['1 – 9', 'Change view (6 – 9: your saved views)'],
		['⌘ / Ctrl + K', 'Search and commands'],
		['?', 'Show shortcuts']
	];
</script>

<svelte:window onkeydown={onKey} />

<main class="mx-auto max-w-4xl px-4 pt-4 pb-24">
	{#if me.data?.lastPollError}
		<Alert.Root variant="destructive" class="mb-4">
			<Alert.Title>Hush cannot read your notifications</Alert.Title>
			<Alert.Description>
				{me.data.lastPollError}
				{#if /token/i.test(me.data.lastPollError)}<a class="underline" href="/login"
						>Sign in again</a
					>{/if}
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if me.data?.ssoHiddenOrgs}
		<Alert.Root class="mb-4">
			<Alert.Title
				>GitHub hides notifications from {me.data.ssoHiddenOrgs}
				{me.data.ssoHiddenOrgs === 1 ? 'org' : 'orgs'}</Alert.Title
			>
			<Alert.Description>
				These orgs use SAML single sign-on, and your token is not authorized for them. On
				github.com/settings/tokens, choose “Configure SSO” next to the token, or <a
					class="underline"
					href="/login">sign in with a different token</a
				>.
			</Alert.Description>
		</Alert.Root>
	{/if}

	<div class="flex flex-wrap items-center gap-2 sm:flex-nowrap">
		<ViewTabs {tabs} onnew={() => editView(null)} />

		<div class="relative min-w-0 flex-1 sm:w-48 sm:flex-none lg:w-56">
			<Search
				class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
			/>
			<Input
				bind:ref={searchEl}
				bind:value={query}
				placeholder="Filter"
				class="h-8 pl-8"
				aria-label="Filter threads"
			/>
		</div>
		{#if saved}
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Edit view {saved.name}"
				title="Edit view"
				onclick={() => editView(saved)}><Pencil /></Button
			>
		{:else if query.trim()}
			<Button variant="ghost" size="sm" onclick={() => editView(null, query.trim())}
				><BookmarkPlus />Save as view</Button
			>
		{/if}
		<Button variant="ghost" size="icon-sm" aria-label="Sync now" onclick={sync} disabled={syncing}>
			<RefreshCw class={cn(syncing && 'animate-spin')} />
		</Button>
		<Button
			variant="ghost"
			size="icon-sm"
			class="hidden sm:inline-flex"
			aria-label="Keyboard shortcuts"
			onclick={() => (helpOpen = true)}
		>
			<Keyboard />
		</Button>
	</div>

	<p class="mt-3 mb-2 px-1 text-xs text-muted-foreground">
		{#if me.data?.lastPollAt}Synced {ago(me.data.lastPollAt)}{:else}First sync in progress…{/if}
		{#if saved}· {VIEW_BASES.find((b) => b.id === saved.base)?.label}{saved.query
				? `, “${saved.query}”`
				: ''}{Object.keys(saved.when ?? {}).length
				? `, ${Object.keys(saved.when).length} ${Object.keys(saved.when).length === 1 ? 'condition' : 'conditions'}`
				: ''}{:else if view === 'fyi'}· Activity you may want to know about, but that does not need
			you.{/if}
	</p>

	<!-- A new tab replaces the list at once and fades the new one in. The rows' own transitions are
	     local, so they play only for changes inside one tab (done, snooze, filter). -->
	{#key viewParam}
		<div in:fade={{ duration: 150 }}>
			{#if threadsQ.isPending}
				<div class="grid gap-2">
					{#each [0, 1, 2, 3] as i (i)}
						<div class="flex items-center gap-3 px-3 py-3">
							<Skeleton class="size-8 rounded-full" />
							<div class="grid flex-1 gap-2">
								<Skeleton class="h-4 w-2/3" />
								<Skeleton class="h-3 w-1/2" />
							</div>
						</div>
					{/each}
				</div>
			{:else if visible.length === 0}
				<div
					class="flex flex-col items-center justify-center rounded-2xl border border-dashed py-20 text-center"
				>
					<CircleCheck class="mb-3 size-8 text-signal-merge" />
					{#if query}
						<p class="font-medium">No threads match “{query}”.</p>
					{:else if view === 'action'}
						<p class="font-medium">Nothing needs you right now.</p>
						<p class="mt-1 text-sm text-muted-foreground">
							{#if counts.fyi}There {counts.fyi === 1 ? 'is' : 'are'}
								<a class="underline" href="/?view=fyi"
									>{counts.fyi} FYI {counts.fyi === 1 ? 'item' : 'items'}</a
								>, if you want them.{:else}Hush tells you when that changes.{/if}
						</p>
					{:else}
						<p class="font-medium">This view is empty.</p>
					{/if}
				</div>
			{:else}
				<ContextMenu.Root>
					<ContextMenu.Trigger>
						{#snippet child({ props })}
							<ul
								{...props}
								class="grid grid-cols-[minmax(0,1fr)] gap-0.5"
								role="listbox"
								aria-multiselectable="true"
								aria-label="Threads"
								oncontextmenucapture={onContextMenu}
							>
								{#each visible as t (t.id)}
									<li
										animate:flip={FLIP}
										out:slide={{ duration: 200, easing: cubicOut }}
										in:fly={{ y: -8, duration: 200 }}
									>
										<ThreadRow
											thread={t}
											selected={t.id === selectedId}
											checked={sel.has(t.id)}
											selecting={sel.size > 0}
											onaction={(x, action, body) => act([x.id], action, body)}
											onopen={open}
											onrowclick={(e) => onRowClick(e, t)}
											ontoggle={(e) => onToggle(e, t)}
											menu={() => menuFor([t.id])}
										/>
									</li>
								{/each}
							</ul>
						{/snippet}
					</ContextMenu.Trigger>
					<ContextMenu.Content class="w-60">
						<AppMenu entries={menuFor(menuIds)} kind="context" />
					</ContextMenu.Content>
				</ContextMenu.Root>
			{/if}
		</div>
	{/key}
</main>

<BulkBar count={sel.size} onclear={() => sel.clear()}>
	{#if inInbox}
		<Button variant="ghost" size="sm" aria-label="Done" onclick={() => act(targets(), 'done')}
			><Check /><span class="hidden sm:inline">Done</span></Button
		>
		<Button
			variant="ghost"
			size="sm"
			class="sm:hidden"
			aria-label="Snooze"
			onclick={() => (bulkSnoozeOpen = true)}><AlarmClock /></Button
		>
		<span class="hidden sm:contents">
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="ghost" size="sm" aria-label="Snooze"
							><AlarmClock /><span class="hidden sm:inline">Snooze</span></Button
						>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="center" side="top" class="w-56">
					<SnoozeItems
						subjects={targets().map((id) => subjectKind(byId(id)?.subjectType ?? ''))}
						onpick={(b) => act(targets(), 'snooze', b)}
					/>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</span>
		<Button variant="ghost" size="sm" aria-label="Mute" onclick={() => act(targets(), 'mute')}
			><BellOff /><span class="hidden sm:inline">Mute</span></Button
		>
	{:else}
		<Button variant="ghost" size="sm" onclick={() => act(targets(), restoreAction(undefined))}>
			<Undo />{view === 'muted' ? 'Unmute' : 'Move to inbox'}
		</Button>
	{/if}
	{@const bulkRead = readAction(targets())}
	<Button
		variant="ghost"
		size="sm"
		aria-label={bulkRead === 'read' ? 'Mark as read' : 'Mark as unread'}
		onclick={() => toggleRead(targets())}
	>
		{#if bulkRead === 'read'}<MailOpen /><span class="hidden sm:inline">Read</span>{:else}<Mail
			/><span class="hidden sm:inline">Unread</span>{/if}
	</Button>
</BulkBar>

<SnoozeSheet
	bind:open={bulkSnoozeOpen}
	subjects={targets().map((id) => subjectKind(byId(id)?.subjectType ?? ''))}
	onpick={(b) => act(targets(), 'snooze', b)}
/>

{#snippet peekFooter()}
	{#if peekThread}
		{@const t = peekThread}
		{#if inInbox}
			<Button variant="ghost" size="sm" aria-label="Done" onclick={() => act([t.id], 'done')}
				><Check /><span class="max-sm:sr-only">Done</span></Button
			>
			{#if wide.current}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button {...props} variant="ghost" size="sm"><AlarmClock />Snooze</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="start" side="top" class="w-56">
						<SnoozeItems
							subjects={[subjectKind(t.subjectType)]}
							disabled={alreadyTrue(t)}
							onpick={(b) => act([t.id], 'snooze', b)}
						/>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{:else}
				<Button
					variant="ghost"
					size="sm"
					aria-label="Snooze"
					onclick={() => (peekSnoozeOpen = true)}
					><AlarmClock /><span class="max-sm:sr-only">Snooze</span></Button
				>
			{/if}
			<Button variant="ghost" size="sm" aria-label="Mute" onclick={() => act([t.id], 'mute')}
				><BellOff /><span class="max-sm:sr-only">Mute</span></Button
			>
		{:else}
			<Button variant="ghost" size="sm" onclick={() => act([t.id], restoreAction(t))}>
				<Undo />{view === 'muted' ? 'Unmute' : 'Move to inbox'}
			</Button>
		{/if}
		<Button
			variant="ghost"
			size="sm"
			aria-label={t.unread ? 'Mark as read' : 'Mark as unread'}
			onclick={() => toggleRead([t.id])}
		>
			{#if t.unread}<MailOpen /><span class="max-sm:sr-only">Read</span>{:else}<Mail /><span
					class="max-sm:sr-only">Unread</span
				>{/if}
		</Button>
		<Button
			variant={t.category === 'action' ? 'default' : 'outline'}
			size="sm"
			class="ml-auto"
			onclick={() => open(t, t.actionUrl)}
			>{t.actionLabel}<ExternalLink class="opacity-60" /></Button
		>
	{/if}
{/snippet}

<Peek target={peekTarget} onclose={() => (peekOpen = false)} footer={peekFooter} />

<SnoozeSheet
	bind:open={menuSnoozeOpen}
	subjects={menuSnoozeIds.map((id) => subjectKind(byId(id)?.subjectType ?? ''))}
	disabled={menuSnoozeIds.length === 1 && byId(menuSnoozeIds[0])
		? alreadyTrue(byId(menuSnoozeIds[0])!)
		: []}
	onpick={(b) => act(menuSnoozeIds, 'snooze', b)}
/>

{#if peekThread}
	<SnoozeSheet
		bind:open={peekSnoozeOpen}
		subjects={[subjectKind(peekThread.subjectType)]}
		disabled={alreadyTrue(peekThread)}
		onpick={(b) => peekThread && act([peekThread.id], 'snooze', b)}
	/>
{/if}

<ViewEditor
	bind:open={viewEditorOpen}
	initial={viewEditing}
	threads={{ ...baseThreads, [view]: threadsQ.data?.threads }}
	me={me.data?.login ?? ''}
	suggest={viewSuggest}
	onsave={saveView}
	ondelete={viewEditing.id ? () => deleteView(viewEditing.id!) : undefined}
/>

<Dialog.Root bind:open={helpOpen}>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Keyboard shortcuts</Dialog.Title>
		</Dialog.Header>
		<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
			{#each shortcuts as [k, d] (k)}
				<dt><Kbd>{k}</Kbd></dt>
				<dd class="text-muted-foreground">{d}</dd>
			{/each}
		</dl>
	</Dialog.Content>
</Dialog.Root>
