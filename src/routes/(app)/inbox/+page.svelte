<script lang="ts">
	import PeekHost from '$lib/components/app/peek-host.svelte';
	import { closeRowMenus } from '$lib/row-menus.svelte';
	import { untrack } from 'svelte';
	import ShortcutsDialog from '$lib/components/app/shortcuts-dialog.svelte';
	import { LIST_MOUSE, shortcutsFor } from '$lib/shortcuts';
	import { commandFor, keysOf } from '$lib/keys.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { MediaQuery, SvelteSet } from 'svelte/reactivity';
	import { flip } from 'svelte/animate';
	import { fade, fly, slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { toast } from 'svelte-sonner';
	import { createQueries, createQuery } from '@tanstack/svelte-query';
	import { api, type ActionBody, type ThreadAction } from '$lib/api';
	import {
		keys,
		meQuery,
		queryClient,
		refetchUnlessLive,
		setCounts,
		threadsQuery
	} from '$lib/queries';
	import { Selection } from '$lib/selection.svelte';
	import type { Counts, SavedView, ThreadDTO, View, ViewBase } from '$lib/shared/types';
	import { VIEW_BASES, threadMatches } from '$lib/shared/views';
	import { leavesOf, parseExpr } from '$lib/shared/query';
	import { conditionId, smartConditions } from '$lib/shared/decisions';
	import { markQueries } from '$lib/shared/categories';
	import { saveSettings } from '$lib/save-settings';
	import ViewEditor from '$lib/components/app/view-editor.svelte';
	import ViewTabs, { type ViewTab } from '$lib/components/app/view-tabs.svelte';
	import Pencil from '@lucide/svelte/icons/pencil';
	import BookmarkPlus from '@lucide/svelte/icons/bookmark-plus';
	import { ago, snoozeOptions } from '$lib/time';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Alert from '$lib/components/ui/alert';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import ThreadRow from '$lib/components/app/thread-row.svelte';
	import BulkBar from '$lib/components/app/bulk-bar.svelte';
	import SnoozeItems from '$lib/components/app/snooze-items.svelte';
	import WhyLine from '$lib/components/app/why-line.svelte';
	import WelcomeCard from '$lib/components/app/welcome-card.svelte';
	import JevNotice from '$lib/components/app/jev-notice.svelte';
	import FilterBuilder from '$lib/components/app/rules/filter-builder.svelte';
	import { previewThreads, ruleSuggestions } from '$lib/rule-preview';
	import { rowMarks } from '$lib/marks';
	import NotNeededDialog, {
		type NotNeededTarget
	} from '$lib/components/app/not-needed-dialog.svelte';
	import SnoozeSheet from '$lib/components/app/snooze-sheet.svelte';
	import {
		claimPeek,
		closePeek,
		linkedPeekTarget,
		peek,
		releasePeekHoldUnlessOn
	} from '$lib/peek.svelte';
	import { keepHeldRow } from '$lib/shared/held-row';
	import AppMenu from '$lib/components/app/app-menu.svelte';
	import { alreadyTrue, subjectKind } from '$lib/shared/snooze';
	import { palette } from '$lib/palette.svelte';
	import {
		inboxCommands,
		inboxMenu,
		readAction,
		restoreAction,
		restoreLabel,
		isOpen,
		type InboxActionContext,
		canSayNotNeeded
	} from '$lib/inbox-actions';
	import { openOnGitHub, reportResolved } from '$lib/recheck';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import { live } from '$lib/live-state.svelte';
	import QuerySuggest from '$lib/components/app/query-suggest.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import Search from '@lucide/svelte/icons/search';
	import Keyboard from '@lucide/svelte/icons/keyboard';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Check from '@lucide/svelte/icons/check';
	import AlarmClock from '@lucide/svelte/icons/alarm-clock';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import Undo from '@lucide/svelte/icons/undo-2';
	import Link from '@lucide/svelte/icons/link';
	import MailOpen from '@lucide/svelte/icons/mail-open';
	import Mail from '@lucide/svelte/icons/mail';
	import CircleSlash from '@lucide/svelte/icons/circle-slash';
	import SwipeRow, { type SwipeSide } from '$lib/components/app/swipe-row.svelte';

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
	/** The notification view on screen, when the tab is one (?view=v:<id>). */
	const saved = $derived(
		viewParam.startsWith('v:') ? (savedViews.find((v) => `v:${v.id}` === viewParam) ?? null) : null
	);
	/** The list the page shows and acts on: a built-in view, or the notification view's base. */
	const view = $derived<View>(
		saved ? saved.base : viewParam.startsWith('v:') ? 'action' : (viewParam as View)
	);
	let query = $state('');
	// The Filter box searches this tab, or every thread (Needs you, FYI, Snoozed, Done, Muted).
	let everywhere = $state(false);
	const searching = $derived(everywhere && !!query.trim());
	const threadsQ = createQuery(() => threadsQuery(searching ? 'all' : view));
	// The base lists of the notification views, for their tab counts (D1 only, usually a 304).
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
		const n = baseThreads[v.base]?.filter((t) =>
			threadMatches(v.query, t, me.data?.login ?? '', me.data?.settings)
		).length;
		if (n !== undefined) lastViewCounts[v.id] = n;
		return lastViewCounts[v.id] ?? null;
	};
	let lastCounts: Counts = { action: 0, fyi: 0, snoozed: 0 };
	const counts = $derived.by(() => (lastCounts = threadsQ.data?.counts ?? lastCounts));

	let syncing = $state(false);
	// The Filter box speaks the query language (shared/query.ts); parts with errors are left out.
	const filter = $derived(parseExpr(query));
	const checkedConditionIds = $derived(
		new Set(
			smartConditions(
				me.data?.settings.views ?? [],
				me.data ? markQueries(me.data.settings) : []
			).map((c) => c.id)
		)
	);
	const aboutHint = $derived.by(() => {
		const about = leavesOf(filter.expr).flatMap((w) => w.about ?? []);
		if (!about.length) return '';
		if (!me.data?.settings.smartDecisions)
			return 'about: needs smart decisions (Settings → Inbox).';
		if (about.every((text) => checkedConditionIds.has(conditionId(text)))) return '';
		return 'Jev checks about: in rules and notification views. Save this filter as a notification view to check it.';
	});
	let selectedId = $state<string | null>(null);
	let helpOpen = $state(false);
	let bulkSnoozeOpen = $state(false);
	let searchEl = $state<HTMLInputElement | null>(null);
	// Threads with a triage request in flight. A refetch must not bring them back.
	const pending = new SvelteSet<string>();
	const sel = new Selection();

	const peekOwner = $derived(`inbox:${view}`);
	let shownBefore: ThreadDTO[] = [];
	const visible = $derived.by(() => {
		const login = me.data?.login ?? '';
		const listed = (threadsQ.data?.threads ?? []).filter(
			(t) =>
				!pending.has(t.id) &&
				(searching || !saved || threadMatches(saved.query, t, login, me.data?.settings)) &&
				threadMatches(query, t, login, me.data?.settings)
		);
		const heldId = peek.heldId;
		const keepsHeldRow =
			heldId !== null && heldId === selectedId && peek.owner === peekOwner && !pending.has(heldId);
		return keepHeldRow(
			listed,
			untrack(() => shownBefore),
			keepsHeldRow ? heldId : null
		);
	});
	$effect.pre(() => {
		shownBefore = visible;
	});
	const order = $derived(visible.map((t) => t.id));
	const selectedIndex = $derived(visible.findIndex((t) => t.id === selectedId));
	const byId = (id: string) => visible.find((t) => t.id === id);

	// Keep a valid cursor and selection when the list changes.
	let lastCursorIndex = 0;
	$effect(() => {
		if (selectedIndex >= 0) lastCursorIndex = selectedIndex;
	});
	$effect(() => {
		if (!visible.some((t) => t.id === selectedId))
			selectedId = visible[Math.min(lastCursorIndex, visible.length - 1)]?.id ?? null;
		untrack(() => sel.prune(order));
	});
	// --- Peek: one panel for the app (lib/peek.svelte.ts); follows the cursor while this view
	// owns it ------------------------------------------------------------------------------
	const owns = $derived(peek.owner === peekOwner);
	const peekOpen = $derived(peek.owner !== null);
	let peekSnoozeOpen = $state(false);
	const wide = new MediaQuery('min-width: 1024px');
	// Read the cursor row even while not owned: a derived whose dependencies change between runs
	// (only `owns` while not owned) missed later cursor moves.
	const peekThread = $derived.by(() => {
		const row = visible[selectedIndex] ?? null;
		return owns ? row : null;
	});
	// Back on the view that owns the peek (after another tab): the cursor goes to the item it
	// shows. Not when this view just took the peek over: then the cursor is where you chose.
	let restoredFor: string | null = null;
	$effect(() => {
		const id = untrack(() => peek.target?.id);
		if (!owns) return void (restoredFor = null);
		if (restoredFor === peekOwner || !threadsQ.data) return;
		restoredFor = peekOwner;
		if (id && visible.some((t) => t.id === id)) untrack(() => (selectedId = id));
	});
	/** This view takes the peek over, on the cursor row. */
	function take() {
		restoredFor = peekOwner;
		claimPeek(peekOwner);
	}
	// While this view owns it, the peek shows the cursor row, with this view's actions. It closes
	// when the list has no row left (for example, after Done on the last one).
	$effect(() => {
		const t = peekThread;
		if (!owns || !threadsQ.data) return;
		untrack(() => {
			releasePeekHoldUnlessOn(t?.id ?? null);
			if (!t) return closePeek();
			peek.target = {
				id: t.id,
				repo: t.repo,
				number: t.number,
				title: t.title,
				url: t.htmlUrl,
				need: t.kind
			};
		});
	});
	$effect(() => {
		if (!owns) return;
		peek.header = peekHeader;
		peek.footer = peekFooter;
		return () => {
			if (peek.header === peekHeader) peek.header = null;
			if (peek.footer === peekFooter) peek.footer = null;
		};
	});
	/** Show a thread in the peek (this view takes it over). */
	function peekThis(t: ThreadDTO) {
		selectedId = t.id;
		take();
	}
	// Reading it in the peek counts as reading it, once it stays open for a moment.
	$effect(() => {
		const t = peekThread;
		if (!t?.unread || me.data?.settings.peekMarksRead === false) return;
		const timer = setTimeout(() => act([t.id], 'read'), 1500);
		return () => clearTimeout(timer);
	});
	// …and as looking at it: "since you looked" starts again (when there is something to reset).
	$effect(() => {
		const t = peekThread;
		if (!t?.number || (t.seenAt && !t.changes?.length)) return;
		const timer = setTimeout(() => seen(t), 1500);
		return () => clearTimeout(timer);
	});
	const seen = (t: ThreadDTO) => t.number && api.seen([`${t.repo}#${t.number}`]).catch(() => {});

	// A new view starts with nothing selected. (The peek stays: it is independent of the view.)
	$effect(() => {
		void view;
		untrack(() => sel.clear());
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
			take();
		});
	});
	$effect(() => {
		const linked = linkedPeekTarget();
		const t = linked
			? threadsQ.data?.threads.find((t) => t.repo === linked.repo && t.number === linked.number)
			: null;
		if (!t) return;
		untrack(() => {
			palette.peekRequest = { page: 'inbox', view, id: t.id };
		});
	});

	async function sync() {
		syncing = true;
		try {
			const status = await api.sync();
			if (status.lastError) toast.error(status.lastError);
			reportResolved(status.resolved ?? []);
			await Promise.all([
				refetchUnlessLive(keys.threadsAll),
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
	async function run(ids: string[], action: ThreadAction, body?: ActionBody) {
		for (let i = 0; i < ids.length; i += BULK_MAX) {
			const res = await api.actMany(ids.slice(i, i + BULK_MAX), action, body);
			setCounts(res.counts);
		}
		refetchUnlessLive(keys.threadsAll);
	}

	async function act(ids: string[], action: ThreadAction, body?: ActionBody) {
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
			run(ids, action)
				.then(() => {
					if (ids.length > 1) toast(LABEL[action]!, { description: `${ids.length} threads` });
				})
				.catch((e) => {
					toast.error(e.message);
					queryClient.invalidateQueries({ queryKey: keys.threads(view) });
				});
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
	/** The targets that are in the inbox now (Done, Snooze, and Mute apply to these). */
	const openTargets = () => targets().filter((id) => isOpen(byId(id)));

	// Read/unread toggle (see readAction).
	const toggleRead = (ids: string[]) => ids.length && act(ids, readAction(actions, ids));

	function open(t: ThreadDTO, url: string) {
		openOnGitHub(url);
		if (t.unread) act([t.id], 'read');
		seen(t);
	}

	async function copyLinks(ids: string[]) {
		const urls = ids
			.map(byId)
			.filter(Boolean)
			.map((t) => t!.htmlUrl);
		await navigator.clipboard.writeText(urls.join('\n'));
		toast.success(urls.length === 1 ? 'Link copied' : `${urls.length} links copied`);
	}

	// The list is the right-click menu's trigger, so a click on a row is not "outside" the
	// menu: close it here.
	let contextOpen = $state(false);
	function onRowClick(e: MouseEvent, t: ThreadDTO) {
		contextOpen = false;
		closeRowMenus();
		if (sel.click(e, t.id, order, selectedId)) return;
		// A click on the card peeks it (PRs, issues, runs, releases…).
		sel.clear();
		selectedId = t.id;
		take();
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
		// Moving with the peek open shows the new row there (this view takes the peek over).
		if (peekOpen && !owns) take();
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
		const cmd = commandFor(e, ['list', 'inbox']);
		if (!cmd) return;
		const t = visible[selectedIndex];
		// Each command's keys: shared/keymap.ts (and Settings → Keybinds).
		const run: Record<string, () => void> = {
			'list.next': () => move(1),
			'list.prev': () => move(-1),
			'list.extendNext': () => move(1, true),
			'list.extendPrev': () => move(-1, true),
			'list.select': () => t && sel.toggle(t.id),
			'list.selectAll': () => sel.all(order),
			'list.peek': () => t && (owns ? closePeek() : take()),
			'list.escape': () => (peekOpen ? closePeek() : sel.clear()),
			'list.open': () => t && open(t, t.actionUrl),
			'list.openGitHub': () => t && open(t, t.htmlUrl),
			'list.copy': () => copyLinks(targets()),
			'list.refresh': () => sync(),
			'list.search': () => searchEl?.focus(),
			'list.help': () => (helpOpen = true),
			'inbox.done': () => openTargets().length && act(openTargets(), 'done'),
			'inbox.snooze': () =>
				openTargets().length && act(openTargets(), 'snooze', { until: snoozeOptions()[2].until }),
			'inbox.mute': () => openTargets().length && act(openTargets(), 'mute'),
			'inbox.read': () => toggleRead(targets()),
			'inbox.notNeeded': () => t && canSayNotNeeded(t) && sayNotNeeded(t)
		};
		VIEWS.forEach((v, i) => (run[`inbox.view.${i + 1}`] = () => goto(`/inbox?view=${v.id}`)));
		savedViews
			.slice(0, 4)
			.forEach(
				(v, i) => (run[`inbox.view.${VIEWS.length + i + 1}`] = () => goto(`/inbox?view=v:${v.id}`))
			);
		const fn = run[cmd];
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

	// Swipe actions on touch screens (Settings → General → Swipe actions; shared/swipe.ts). A side
	// whose action does not apply to the thread does nothing.
	function swipeSide(side: 'left' | 'right', t: ThreadDTO): SwipeSide | null {
		const id = me.data?.settings.swipe.inbox[side] ?? 'none';
		const open = isOpen(t);
		switch (id) {
			case 'done':
				return open
					? {
							label: 'Done',
							icon: Check,
							tone: 'bg-signal-merge text-white',
							run: () => act([t.id], 'done')
						}
					: null;
			case 'snooze':
				return open
					? {
							label: 'Snooze',
							icon: AlarmClock,
							tone: 'bg-signal-warn text-white',
							run: () => actions.snoozeSheet([t.id])
						}
					: null;
			case 'mute':
				return t.category !== 'muted'
					? {
							label: 'Mute',
							icon: BellOff,
							tone: 'bg-muted-foreground text-background',
							run: () => act([t.id], 'mute')
						}
					: null;
			case 'read':
				return {
					label: t.unread ? 'Read' : 'Unread',
					icon: t.unread ? MailOpen : Mail,
					tone: 'bg-signal-review text-white',
					run: () => toggleRead([t.id])
				};
			case 'not-needed':
				return canSayNotNeeded(t)
					? {
							label: 'Doesn’t need me',
							icon: CircleSlash,
							tone: 'bg-foreground text-background',
							run: () => sayNotNeeded(t)
						}
					: null;
		}
		return null;
	}

	// "Doesn't need me…": Hush was wrong about a Needs you thread (not-needed-dialog.svelte).
	let notNeededFor = $state<NotNeededTarget | null>(null);
	function sayNotNeeded(t: ThreadDTO) {
		notNeededFor = {
			id: t.id,
			title: t.title,
			repo: t.repo,
			review: t.kind === 'review',
			// A team's request reads "@alice requests review from acme/web" (shared/dashboard.ts).
			team: t.kind === 'review' && / requests review from /.test(t.summary),
			bot: t.authorIsBot,
			elsewhere: 'FYI'
		};
	}

	// Menus and ⌘K commands (see inbox-actions.ts) read the page through this context.
	const actions: InboxActionContext = {
		get order() {
			return order;
		},
		get menu() {
			return me.data?.settings.menus.inbox;
		},
		sel,
		byId,
		peek: peekThis,
		open,
		act,
		copyLinks,
		snoozeSheet: (ids) => {
			menuSnoozeIds = ids;
			menuSnoozeOpen = true;
		},
		notNeeded: sayNotNeeded
	};
	const menuFor = (ids: string[]) => inboxMenu(actions, ids);
	$effect(() => palette.register(() => inboxCommands(actions, targets())));

	// --- Notification views ------------------------------------------------------------------------
	// Settings → Inbox links here with &edit=1 to edit a view.
	$effect(() => {
		if (!saved || page.url.searchParams.get('edit') !== '1') return;
		const v = saved;
		untrack(() => {
			editView(v);
			goto(`/inbox?view=v:${v.id}`, { replaceState: true, noScroll: true });
		});
	});
	const tabs = $derived<ViewTab[]>([
		...VIEWS.map((v) => ({
			key: v.id,
			href: `/inbox?view=${v.id}`,
			label: v.label,
			count: count(v.id),
			strong: v.id === 'action',
			active: !saved && view === v.id
		})),
		...savedViews.map((v) => ({
			key: `v:${v.id}`,
			href: `/inbox?view=v:${v.id}`,
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
		query: ''
	});
	/** Open the editor: a view to edit, or a new one (from the current tab and filter text). */
	function editView(v: SavedView | null, fromFilter = false) {
		viewEditing = v
			? structuredClone($state.snapshot(v))
			: {
					name: fromFilter ? query.trim().slice(0, 40) : '',
					base:
						view === 'action' || view === 'fyi' || view === 'snoozed' || view === 'done'
							? view
							: 'inbox',
					query: fromFilter ? query.trim() : ''
				};
		viewEditorOpen = true;
	}
	async function saveView(v: Omit<SavedView, 'id'> & { id?: string }) {
		const clean: SavedView = {
			...v,
			name: v.name.trim(),
			id: v.id ?? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
		};
		const views = v.id
			? savedViews.map((x) => (x.id === v.id ? clean : x))
			: [...savedViews, clean];
		if (await saveSettings({ views }, v.id ? 'View saved' : `View “${clean.name}” added`)) {
			viewEditorOpen = false;
			if (!v.id) {
				query = '';
				goto(`/inbox?view=v:${clean.id}`);
			}
		}
	}
	async function deleteView(id: string) {
		if (await saveSettings({ views: savedViews.filter((x) => x.id !== id) }, 'View deleted')) {
			viewEditorOpen = false;
			goto('/inbox?view=action');
		}
	}
	const count = (v: View) => (v === 'action' || v === 'fyi' || v === 'snoozed' ? counts[v] : null);
</script>

<svelte:window onkeydown={onKey} />

<main data-page class="mx-auto max-w-4xl px-2 pt-3 pb-24 sm:px-4 sm:pt-4">
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
				placeholder="Filter: words, or repo:, needs:, from:…"
				class="h-8 pr-8 pl-8"
				aria-label="Filter threads"
			/>
			<FilterBuilder
				bind:value={query}
				id="inbox-filter"
				suggestions={ruleSuggestions(me.data?.settings)}
				preview={(q) =>
					me.data && threadsQ.data
						? previewThreads(q, me.data.login, threadsQ.data.threads, me.data.settings)
						: null}
			/>
			<QuerySuggest input={searchEl} value={query} onpick={(next) => (query = next)} />
			<!-- A filter error: under the box, over the list. -->
			{#if filter.errors.length}
				<p
					transition:fly={{ y: -4, duration: 120 }}
					class="absolute top-full right-0 z-10 mt-1 w-max max-w-72 rounded-md border bg-popover px-2.5 py-1 text-xs text-destructive shadow-md"
					role="status"
				>
					{filter.errors[0]}
				</p>
			{:else if aboutHint}
				<p
					transition:fly={{ y: -4, duration: 120 }}
					class="absolute top-full right-0 z-10 mt-1 w-max max-w-72 rounded-md border bg-popover px-2.5 py-1 text-xs text-muted-foreground shadow-md"
					role="status"
				>
					{aboutHint}
				</p>
			{/if}
			<!-- Inside the box, at its right end, over the text: typing does not move anything. -->
			{#if !saved && query.trim() && !filter.errors.length}
				<Tooltip.Root>
					<Tooltip.Trigger
						class="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded-md bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						aria-label="Save this filter as a notification view"
						onclick={() => editView(null, true)}
					>
						<BookmarkPlus class="size-3.5" />
					</Tooltip.Trigger>
					<Tooltip.Content>Save this filter as a notification view (a new tab)</Tooltip.Content>
				</Tooltip.Root>
			{/if}
		</div>
		{#if saved}
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Edit notification view {saved.name}"
				title="Edit notification view"
				onclick={() => editView(saved)}><Pencil /></Button
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

	{#if query.trim()}
		<div class="mt-3 flex items-center gap-2 px-1 text-xs" role="radiogroup" aria-label="Search">
			<span class="text-muted-foreground">Search</span>
			{#each [{ on: false, label: saved ? `“${saved.name}”` : 'this tab' }, { on: true, label: 'everywhere (also Done, Snoozed, Muted)' }] as o (o.label)}
				<button
					type="button"
					role="radio"
					aria-checked={everywhere === o.on}
					class={cn(
						'rounded-md px-2 py-0.5 text-muted-foreground hover:text-foreground',
						everywhere === o.on && 'bg-muted text-foreground'
					)}
					onclick={() => (everywhere = o.on)}>{o.label}</button
				>
			{/each}
		</div>
	{/if}
	<p class="mt-3 mb-2 px-1 text-xs text-muted-foreground">
		{#if me.data?.firstSync}<span class="inline-flex items-center gap-1"
				><RefreshCw class="size-3 animate-spin" />First sync in progress…</span
			>{:else if syncing || live.syncing}<span class="inline-flex items-center gap-1"
				><RefreshCw class="size-3 animate-spin" />Syncing…</span
			>{:else if me.data?.lastPollAt}Synced {ago(me.data.lastPollAt)}{/if}
		{#if saved}· {VIEW_BASES.find((b) => b.id === saved.base)?.label}{saved.query
				? `, ${saved.query}`
				: ''}{:else if view === 'fyi'}· Activity you may want to know about, but that does not need
			you.{/if}
	</p>

	<!-- A new tab replaces the list at once and fades the new one in. The rows' own transitions are
	     local, so they play only for changes inside one tab (done, snooze, filter). -->
	{#if me.data && !me.data.onboarded}<WelcomeCard />{:else}<JevNotice />{/if}

	{#key viewParam}
		<div in:fade={{ duration: 150 }}>
			{#if threadsQ.isPending || (visible.length === 0 && !query && me.data?.firstSync)}
				{#if !threadsQ.isPending}
					<p class="px-3 pb-1 text-sm text-muted-foreground" role="status">
						Hush is reading your notifications from the last 14 days. The first sync can take a
						minute.
					</p>
				{/if}
				<div class="grid gap-2" aria-hidden="true">
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
								<a class="underline" href="/inbox?view=fyi"
									>{counts.fyi} FYI {counts.fyi === 1 ? 'item' : 'items'}</a
								>, if you want them.{:else}Hush tells you when that changes.{/if}
						</p>
					{:else}
						<p class="font-medium">This view is empty.</p>
					{/if}
				</div>
			{:else}
				<ContextMenu.Root bind:open={contextOpen}>
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
										<SwipeRow left={swipeSide('left', t)} right={swipeSide('right', t)}>
											<ThreadRow
												thread={t}
												showList={searching}
												hidden={me.data?.settings.rows.thread ?? []}
												marks={rowMarks(t.itemCategory, t.tags, me.data?.settings)}
												selected={t.id === selectedId}
												checked={sel.has(t.id)}
												selecting={sel.size > 0}
												onaction={(x, action, body) => act([x.id], action, body)}
												onopen={open}
												onrowclick={(e) => onRowClick(e, t)}
												ontoggle={(e) => onToggle(e, t)}
												menu={() => menuFor([t.id])}
											/>
										</SwipeRow>
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
	{@const open = openTargets()}
	{@const back = targets().filter((id) => !isOpen(byId(id)))}
	{#if open.length}
		<Button variant="ghost" size="sm" aria-label="Done" onclick={() => act(open, 'done')}
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
						subjects={open.map((id) => subjectKind(byId(id)?.subjectType ?? ''))}
						onpick={(b) => act(open, 'snooze', b)}
					/>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</span>
		<Button variant="ghost" size="sm" aria-label="Mute" onclick={() => act(open, 'mute')}
			><BellOff /><span class="hidden sm:inline">Mute</span></Button
		>
	{/if}
	{#if back.length}
		<Button variant="ghost" size="sm" onclick={() => act(back, restoreAction(byId(back[0])))}>
			<Undo />{restoreLabel(byId(back[0]))}
		</Button>
	{/if}
	{@const bulkRead = readAction(actions, targets())}
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

<NotNeededDialog bind:target={notNeededFor} />

<SnoozeSheet
	bind:open={bulkSnoozeOpen}
	subjects={targets().map((id) => subjectKind(byId(id)?.subjectType ?? ''))}
	onpick={(b) => act(targets(), 'snooze', b)}
/>

{#snippet peekHeader()}
	{#if peekThread}
		{@const t = peekThread}
		<WhyLine
			lead={t.triage === 'done'
				? 'Done'
				: t.triage === 'snoozed'
					? 'Snoozed'
					: t.category === 'muted'
						? 'Muted'
						: t.category === 'action'
							? 'Needs you'
							: 'FYI'}
			text={t.summary}
			changes={t.changes ?? []}
			seenAt={t.seenAt ?? null}
			notes={[
				t.why && `GitHub: ${t.why.charAt(0).toLowerCase()}${t.why.slice(1)}`,
				t.rule && (t.rule === 'Muted by you' ? 'You muted it' : `Category: ${t.rule}`),
				t.override && 'You said it doesn’t need you, until it changes',
				t.resolvedNote && `Hush moved it: ${t.resolvedNote}`
			]}
		>
			{#snippet actions()}
				{#if canSayNotNeeded(t)}
					<Button
						variant="outline"
						size="xs"
						title="Doesn’t need me ({keysOf('inbox.notNeeded')[0] ?? ''})"
						onclick={() => sayNotNeeded(t)}>Doesn’t need me</Button
					>
				{/if}
			{/snippet}
		</WhyLine>
	{/if}
{/snippet}

{#snippet peekFooter()}
	{#if peekThread}
		{@const t = peekThread}
		{#if isOpen(t)}
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
				<Undo />{restoreLabel(t)}
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
	{/if}
{/snippet}

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
	settings={me.data?.settings}
	onsave={saveView}
	ondelete={viewEditing.id ? () => deleteView(viewEditing.id!) : undefined}
/>

<ShortcutsDialog
	bind:open={helpOpen}
	shortcuts={shortcutsFor(['global', 'list', 'inbox', 'peek'], LIST_MOUSE)}
/>

<PeekHost />
