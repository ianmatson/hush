<script lang="ts">
	import PeekHost from '$lib/components/app/peek-host.svelte';
	import { closeRowMenus } from '$lib/row-menus.svelte';
	import { untrack } from 'svelte';
	import {
		VIEW_KEY_SCOPES,
		dashCommands,
		dashMenu,
		type DashActionContext
	} from '$lib/dash-actions';
	import {
		UNTIL_NEW_ACTIVITY,
		copyLinks,
		markItemsSeen,
		pinItems,
		setItemsRead,
		snoozeItems,
		toggleItemsRead,
		toggleMuteItems,
		unsnoozeItems
	} from '$lib/item-actions';
	import type { SnoozeChoice } from '$lib/shared/item-snooze';
	import { alreadyTrue } from '$lib/shared/snooze';
	import { snoozeOptions } from '$lib/time';
	import SnoozeButton from './snooze-button.svelte';
	import SnoozeSheet from './snooze-sheet.svelte';
	import ShortcutsDialog from '$lib/components/app/shortcuts-dialog.svelte';
	import { LIST_MOUSE, shortcutsFor } from '$lib/shortcuts';
	import { commandFor, ignoreKey, keyActivatesFocusedControl } from '$lib/keys.svelte';
	import { itemPagePath } from '$lib/shared/item-page';
	import { goto } from '$app/navigation';
	import { flipGroup, flipInGroup, recordPlacesInGroups } from '$lib/group-flip';
	import { fade, fly, slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { toast } from 'svelte-sonner';
	import { createQuery } from '@tanstack/svelte-query';
	import { api } from '$lib/api';
	import { itemsQuery, keys, queryClient } from '$lib/queries';
	import { applySettings } from '$lib/save-settings';
	import { dismissNote, dismissedNotes } from '$lib/dismissed-notes.svelte';
	import { Selection } from '$lib/selection.svelte';
	import { listKeyboardTarget } from '$lib/list-keyboard-target';
	import { tokenHelp } from '$lib/token-help';
	import { sortOfView } from '$lib/shared/sorting';
	import {
		inSavedView,
		inViewPopulation,
		viewPopulation,
		savedViewSections
	} from '$lib/shared/view-projection';
	import DisplayMenu from './display-menu.svelte';
	import {
		CLOSED_SECTION,
		groupByLabel,
		groupByOptions,
		projectsHolding
	} from '$lib/shared/grouping';
	import { closedSectionLabel, keepsClosed } from '$lib/shared/closed-items';
	import { projectAccessOf, statusColor } from '$lib/shared/projects';
	import { MARK_DOT } from '$lib/marks';
	import {
		findStacks,
		rotateToFront,
		stackByMember,
		unitsOf,
		type ListUnit,
		type Stack,
		type StackMember
	} from '$lib/shared/stacks';
	import StackStrip from './stack-strip.svelte';
	import StackOutsideRow from './stack-outside-row.svelte';
	import type {
		DashItem,
		DashKind,
		DashProject,
		GroupBy,
		ItemView,
		ViewSort
	} from '$lib/shared/types';
	import { viewKinds } from '$lib/shared/item-views';
	import { ago } from '$lib/time';
	import { cn } from '$lib/utils';
	import {
		matchesCategoryFilter,
		type CategoryFilter,
		type CategoryPin
	} from '$lib/shared/categories';
	import { rowMarks, type RowMark } from '$lib/marks';
	import MarkFilter from './marks/mark-filter.svelte';
	import KindSelect from './kind-select.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Alert from '$lib/components/ui/alert';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import DashRow from './dash-row.svelte';
	import DashTableRow from './dash-table-row.svelte';
	import LayoutOffer from './layout-offer.svelte';
	import { palette } from '$lib/palette.svelte';
	import AppMenu from './app-menu.svelte';
	import { meQuery } from '$lib/queries';
	import { openOnGitHub } from '$lib/recheck';
	import { claimPeek, closePeek, peek, releasePeekHoldUnlessOn } from '$lib/peek.svelte';
	import { keepHeldRow } from '$lib/shared/held-row';
	import ItemWhyLine from './item-why-line.svelte';
	import { changesSinceOpening } from '$lib/changes-since-opening.svelte';
	import SwipeRow, { type SwipeSide } from './swipe-row.svelte';
	import BulkBar from './bulk-bar.svelte';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import AlarmClock from '@lucide/svelte/icons/alarm-clock';
	import AlarmClockOff from '@lucide/svelte/icons/alarm-clock-off';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import Mail from '@lucide/svelte/icons/mail';
	import MailOpen from '@lucide/svelte/icons/mail-open';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import FunnelX from '@lucide/svelte/icons/funnel-x';
	import Link from '@lucide/svelte/icons/link';
	import Tip from './tip.svelte';

	let { view }: { view: ItemView } = $props();
	type Showing = DashKind | 'both';
	const showingOptions = (v: ItemView): Showing[] => {
		const kinds = viewKinds(v);
		return kinds.length > 1 ? [...kinds, 'both'] : kinds;
	};
	const showingKey = (id: string) => `hush:view-kind:${id}`;
	function readShowing(v: ItemView): Showing {
		const options = showingOptions(v);
		const asked = localStorage.getItem(showingKey(v.id));
		const everythingItFinds = options.includes('both') ? 'both' : options[0];
		return options.find((k) => k === asked) ?? everythingItFinds ?? 'pr';
	}
	let showing = $state<Showing>(readShowing(untrack(() => view)));
	function show(next: Showing) {
		showing = next;
		localStorage.setItem(showingKey(view.id), next);
	}
	const kinds = $derived<DashKind[]>(showing === 'both' ? viewKinds(view) : [showing]);
	const noun = $derived(
		showing === 'both' ? 'pull requests and issues' : showing === 'pr' ? 'pull requests' : 'issues'
	);
	const FLIP = { duration: 260, easing: cubicOut };
	const SECTION_SLIDE = { duration: 220, easing: cubicOut };
	const LIST_SWAP = { duration: 160, easing: cubicOut };
	const ROW_OUT = { duration: 200, easing: cubicOut };
	const EMPTY_LIST_FALLBACK_MS = ROW_OUT.duration + 100;

	const itemsQ = createQuery(itemsQuery);
	const queryOf = (_kind: DashKind) => itemsQ;
	const me = createQuery(meQuery);
	const data = $derived.by(() => {
		const answer = itemsQ.data;
		if (!answer) return null;
		const summary = answer.views.find((v) => v.id === view.id);
		const health = summary?.health ?? [];
		return {
			items: answer.rows.filter((row) => kinds.includes(row.kind)),
			errors: [...new Set(health.flatMap((source) => source.error ?? []))],
			skipped: summary?.skipped ? [summary.skipped] : [],
			fetchedAt: me.data?.lastPollAt ?? answer.evaluatedAt,
			refreshing: false,
			projects: answer.projects
		};
	});
	const pageOpenedAt = Date.now();
	const fetching = $derived(itemsQ.isFetching);
	const revalidatingAfterOpen = $derived(fetching && itemsQ.dataUpdatedAt < pageOpenedAt);
	const failedKinds = $derived(itemsQ.isError ? kinds.slice(0, 1) : []);
	const kindNoun = (k: DashKind) => (k === 'pr' ? 'pull requests' : 'issues');
	const pending = $derived(itemsQ.isPending);
	const everyKindAnswered = $derived(!!itemsQ.data);
	let refreshing = $state(false);
	let categoryFilter = $state<CategoryFilter[]>([]);
	let showSnoozed = $state(false);
	let snoozeSheetIds = $state<string[] | null>(null);
	let selectedId = $state<string | null>(null);
	let helpOpen = $state(false);
	const DEFAULT_COLLAPSED = new Set(['drafts']);
	const collapsedKey = (v: ItemView) => `hush:collapsed:${v.id}:${v.groupBy}`;
	// Collapsed sections are read at once (not after the first paint), and they slide only after
	// you open or close one: a page that loads shows them as they are, with no motion.
	function readCollapsed(v: ItemView): Record<string, boolean> {
		try {
			return JSON.parse(localStorage.getItem(collapsedKey(v)) ?? '{}');
		} catch {
			return {};
		}
	}
	let collapsedChoice = $state<Record<string, boolean>>(readCollapsed(untrack(() => view)));
	const isCollapsed = (key: string) => collapsedChoice[key] ?? DEFAULT_COLLAPSED.has(key);
	function setCollapsed(key: string, value: boolean) {
		collapsedChoice = { ...collapsedChoice, [key]: value };
		localStorage.setItem(collapsedKey(view), JSON.stringify(collapsedChoice));
	}
	let groupMotion = $state(false);
	const sel = new Selection();

	const categoryGroups = $derived(me.data?.settings.categoryGroups ?? []);

	const marksFor = (i: DashItem): RowMark[] => rowMarks(i.categories, me.data?.settings);

	const keepClosed = $derived(keepsClosed(view));
	const closedLabel = $derived(closedSectionLabel(kinds));
	const inView = (i: DashItem) => inSavedView(i, view);
	const visibleItems = $derived((data?.items ?? []).filter((i) => !i.dismissed && inView(i)));
	const inShownPopulation = (i: DashItem) => inViewPopulation(i, view, showSnoozed);
	const shownPopulation = $derived((data?.items ?? []).filter(inShownPopulation));
	const categoryCount = (filter: CategoryFilter) =>
		shownPopulation.filter((i) => matchesCategoryFilter(i.categories, filter, categoryGroups))
			.length;
	const hiddenPartsOf = (i: DashItem) => me.data?.settings.rows[i.kind] ?? [];
	const tableLayout = $derived(me.data?.settings.rowLayout === 'table');
	const tableColumns = $derived(me.data?.settings.tableColumns ?? []);

	const putAside = $derived((data?.items ?? []).filter((i) => i.dismissed && inView(i)));
	const snoozedCount = $derived(putAside.length);
	const unreadCount = $derived(visibleItems.filter((i) => i.unread).length);

	const peekOwner = $derived(`view:${view.id}:${showing}`);
	const owns = $derived(peek.owner === peekOwner);
	let filteredBefore: DashItem[] = [];
	const filtered = $derived.by(() => {
		const listed = viewPopulation(
			data?.items ?? [],
			view,
			categoryGroups,
			categoryFilter,
			showSnoozed
		);
		return keepHeldRow(
			listed,
			untrack(() => filteredBefore),
			peek.owner === peekOwner && selectedId === peek.heldId ? peek.heldId : null
		);
	});
	$effect.pre(() => {
		filteredBefore = filtered;
	});
	let listKept = $state(false);
	let shapeWithRows: string | null = null;
	let outrosRunning = 0;
	function dropEmptyList() {
		if (!filtered.length) listKept = false;
	}
	function outroStarted() {
		outrosRunning++;
	}
	function outroEnded() {
		outrosRunning = Math.max(0, outrosRunning - 1);
		if (!outrosRunning) dropEmptyList();
	}
	function dropEmptyListAfterMissedOutros() {
		outrosRunning = 0;
		dropEmptyList();
	}
	$effect(() => {
		const shape = listShape;
		if (filtered.length) {
			shapeWithRows = shape;
			listKept = true;
			return;
		}
		if (shape !== shapeWithRows) {
			listKept = false;
			return;
		}
		const fallback = setTimeout(dropEmptyListAfterMissedOutros, EMPTY_LIST_FALLBACK_MS);
		return () => clearTimeout(fallback);
	});
	const heldOutOfKeyboardOrder = (id: string | null) =>
		id !== null && id === peek.heldId && owns && filtered.some((i) => i.id === id);

	const groupBy = $derived(view.groupBy);
	const viewSort = $derived(sortOfView(view));
	const listShape = $derived(
		JSON.stringify([showing, showSnoozed, categoryFilter, groupBy, keepClosed])
	);
	const projects = $derived<DashProject[]>(
		projectsHolding(visibleItems, data?.projects ?? [], groupBy)
	);
	const noProjectAccess = $derived(!!me.data && projectAccessOf(me.data.scopes ?? []) === 'none');
	const hasSections = $derived(!!view.sections?.length);
	const groupByChoices = $derived(groupByOptions(categoryGroups, projects, hasSections));
	const editSectionsPath = $derived(`/settings/views#view-${view.id}`);
	const groupByName = $derived(groupByLabel(groupBy, categoryGroups, data?.projects ?? []));
	const sections = $derived(
		savedViewSections(
			filtered,
			view,
			{
				me: me.data?.login ?? '',
				categoryGroups,
				projects: data?.projects,
				sections: view.sections
			},
			kinds
		)
	);

	let stackFront = $state<Record<string, string>>({});
	let rotationDirection = $state(0);
	let peekedOutsideKey = $state<string | null>(null);

	const stacks = $derived(
		kinds.includes('pr')
			? findStacks(
					sections
						.filter((section) => section.key !== CLOSED_SECTION)
						.flatMap((section) => section.items)
				)
			: []
	);
	const stackOf = $derived(stackByMember(stacks));
	const rotated = (s: Stack) => rotateToFront(s, stackFront[s.bottomKey]);
	const inListMembers = (members: StackMember[]) =>
		members.flatMap((m) => (m.itemInList ? [m.itemInList] : []));
	const itemsOfUnit = (u: ListUnit) => (u.stack ? inListMembers(rotated(u.stack)) : [u.item]);
	const visibleItemOfUnit = (u: ListUnit) => itemsOfUnit(u).slice(0, 1);

	const sectionLabelOf = (id: string) =>
		sections.find((section) => section.items.some((x) => x.id === id))?.label || view.name;
	const listed = $derived(
		sections.map((section) => {
			const units = unitsOf(section.items, stackOf);
			return { ...section, units, items: units.flatMap(itemsOfUnit) };
		})
	);
	let groupsEl = $state<HTMLElement>();
	$effect.pre(() => {
		void listed;
		if (groupsEl) recordPlacesInGroups(groupsEl.children);
	});

	/** Keyboard order: only rows in open sections. */
	const navigable = $derived(
		listed.flatMap((section) =>
			isCollapsed(section.key) ? [] : section.units.flatMap(visibleItemOfUnit)
		)
	);
	const order = $derived(navigable.map((i) => i.id));
	const selectedIndex = $derived(navigable.findIndex((i) => i.id === selectedId));
	const itemsById = $derived(new Map((data?.items ?? []).map((i) => [i.id, i])));
	const byId = (id: string) => itemsById.get(id);

	// --- Peek: one panel for the app (lib/peek.svelte.ts); follows the cursor while this page
	// owns it ------------------------------------------------------------------------------
	const peekOpen = $derived(peek.owner !== null);
	// Read the cursor row even while not owned: a derived whose dependencies change between runs
	// (only `owns` while not owned) missed later cursor moves.
	const peekedOutsideMember = $derived.by(() => {
		const key = peekedOutsideKey;
		if (!owns || !key) return null;
		const m = stackOf.get(key)?.membersBottomFirst.find((x) => x.key === key);
		return m && !m.itemInList ? m : null;
	});
	const peekItem = $derived.by(() => {
		const row =
			navigable[selectedIndex] ??
			(heldOutOfKeyboardOrder(selectedId) ? filtered.find((i) => i.id === selectedId) : null) ??
			null;
		return owns && !peekedOutsideMember ? row : null;
	});
	const peekCurrentKey = $derived(peekedOutsideMember?.key ?? peekItem?.id ?? null);
	const peekStack = $derived(peekCurrentKey ? (stackOf.get(peekCurrentKey) ?? null) : null);
	const peekChanges = changesSinceOpening(() => peekItem);
	let readByPeek: string | null = null;
	$effect(() => {
		const i = peekItem;
		if (i?.id === readByPeek) return;
		readByPeek = i?.id ?? null;
		if (i?.unread) untrack(() => markItemsSeen([i.id]));
	});
	$effect(() => {
		void showing;
		untrack(() => {
			categoryFilter = [];
			selectedId = null;
			sel.clear();
			groupMotion = false;
		});
	});
	$effect(() => {
		void groupBy;
		untrack(() => {
			groupMotion = false;
			collapsedChoice = readCollapsed(view);
		});
	});
	// Back on the page that owns the peek (after another tab): the cursor goes to the item it
	// shows. Not when this page just took the peek over: then the cursor is where you chose.
	let restoredFor: string | null = null;
	$effect(() => {
		const id = untrack(() => peek.target?.id);
		if (!owns) return void (restoredFor = null);
		if (restoredFor === peekOwner || !data) return;
		restoredFor = peekOwner;
		if (!id) return;
		untrack(() => {
			if (byId(id) && stackOf.has(id)) revealInStack(id);
			if (navigable.some((i) => i.id === id) || stackOf.has(id)) selectedId = id;
		});
	});
	/** This page takes the peek over, on the cursor row. */
	function take() {
		restoredFor = peekOwner;
		claimPeek(peekOwner);
	}
	// While this page owns it, the peek shows the cursor row, with this page's actions. It closes
	// when no row is left.
	$effect(() => {
		const i = peekItem;
		const outside = peekedOutsideMember;
		if (!owns || !data) return;
		untrack(() => {
			if (outside) {
				peek.target = {
					id: outside.key,
					repo: outside.repo,
					number: outside.number,
					title: outside.title,
					url: outside.url,
					need: null
				};
				return;
			}
			releasePeekHoldUnlessOn(i?.id ?? null);
			if (!i) return closePeek();
			peek.target = {
				id: i.id,
				repo: i.repo,
				number: i.number,
				title: i.title,
				url: i.url,
				need: i.requestedMe ? 'review' : null
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
	/** Show an item in the peek (this page takes it over). */
	function peekThis(i: DashItem) {
		peekedOutsideKey = null;
		revealInStack(i.id);
		selectedId = i.id;
		take();
	}

	function revealInStack(id: string) {
		const stack = stackOf.get(id);
		if (stack) stackFront[stack.bottomKey] = id;
	}

	const cursorIsIn = (stack: Stack) => !!selectedId && stackOf.get(selectedId) === stack;
	const positionIn = (stack: Stack, key: string) =>
		stack.membersBottomFirst.findIndex((m) => m.key === key);

	function showStackMember(stack: Stack, m: StackMember, direction: number) {
		rotationDirection = direction;
		stackFront[stack.bottomKey] = m.key;
		if (m.itemInList) {
			peekedOutsideKey = null;
			selectedId = m.itemInList.id;
			if (peekOpen && !owns) take();
			return;
		}
		if (!cursorIsIn(stack)) selectedId = inListMembers(rotated(stack))[0]?.id ?? selectedId;
		peekedOutsideKey = m.key;
		take();
	}

	function stepStack(direction: 1 | -1) {
		const key = peek.target?.id ?? selectedId;
		const stack = key ? stackOf.get(key) : undefined;
		if (!stack || !key) return;
		const next = stack.membersBottomFirst[positionIn(stack, key) + direction];
		if (!next) return;
		const home = sections.find((section) => section.items.some((i) => stackOf.get(i.id) === stack));
		if (home) setCollapsed(home.key, false);
		showStackMember(stack, next, direction);
	}

	function pickInStrip(stack: Stack, m: StackMember) {
		const from = peekCurrentKey ? positionIn(stack, peekCurrentKey) : 0;
		showStackMember(stack, m, Math.sign(positionIn(stack, m.key) - from));
	}

	function peekOutside(stack: Stack, m: StackMember) {
		contextOpen = false;
		closeRowMenus();
		sel.clear();
		if (!cursorIsIn(stack)) selectedId = inListMembers(rotated(stack))[0]?.id ?? selectedId;
		if (opensFullPage) return goto(itemPagePath(m.repo, m.number, 'pr'));
		peekedOutsideKey = m.key;
		take();
	}

	const ROTATION = { duration: 260, easing: cubicOut };
	const rotationSlide = (offsetSign: number) => ({
		...ROTATION,
		duration: offsetSign ? ROTATION.duration : 0,
		css: (t: number, u: number) => `transform: translateY(${offsetSign * u * 100}%); opacity: ${t}`
	});
	const rotateIn = (_node: Element, direction: number) => rotationSlide(-direction);
	const rotateOut = (_node: Element, direction: number) => rotationSlide(direction);

	// --- Everything else --------------------------------------------------------------
	let lastCursorIndex = 0;
	$effect(() => {
		if (selectedIndex >= 0) lastCursorIndex = selectedIndex;
	});
	$effect(() => {
		if (!navigable.some((i) => i.id === selectedId) && !heldOutOfKeyboardOrder(selectedId)) {
			const stack = selectedId ? stackOf.get(selectedId) : undefined;
			const standIn = stack && navigable.find((i) => stackOf.get(i.id) === stack);
			const rowThatTookItsPlace = navigable[Math.min(lastCursorIndex, navigable.length - 1)];
			selectedId = standIn?.id ?? rowThatTookItsPlace?.id ?? null;
		}
		untrack(() => sel.prune(order));
	});

	async function refresh() {
		refreshing = true;
		try {
			await api.sync();
			await queryClient.invalidateQueries({ queryKey: keys.items });
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			refreshing = false;
		}
	}

	// (After the effect above, which resets the cursor when the page opens.)
	// The command palette chose an item on this dashboard: show it (clear filters, open its
	// group) and peek it.
	$effect(() => {
		const r = palette.peekRequest;
		if (!r || r.page !== 'view' || r.view !== view.id) return;
		if (!kinds.includes(r.kind)) {
			if (viewKinds(view).includes(r.kind)) untrack(() => (showing = r.kind));
			return;
		}
		if (!data) return;
		const item = byId(r.id);
		untrack(() => {
			palette.peekRequest = null;
			if (!item) return;
			categoryFilter = [];
			showSnoozed = !!item.dismissed;
			sel.clear();
			peekedOutsideKey = null;
			const lead = stackOf.get(item.id)?.mostUrgentInList ?? item;
			const home = sections.find((section) => section.items.some((x) => x.id === lead.id));
			if (home) setCollapsed(home.key, false);
			revealInStack(item.id);
			selectedId = item.id;
			take();
		});
	});

	const countIn = (k: DashKind) =>
		(itemsQ.data?.rows ?? []).filter(
			(i) => i.kind === k && i.views.includes(view.id) && inShownPopulation(i)
		).length;

	const setGroupBy = (by: GroupBy) => by !== view.groupBy && updateView({ groupBy: by });
	const setSort = (sort: ViewSort) => updateView({ sort });
	const setKeepClosed = (on: boolean) => updateView({ keepClosed: on ? undefined : false });

	async function updateView(patch: Partial<ItemView>) {
		const settings = me.data?.settings;
		if (!settings) return;
		const views = settings.views.map((v) => (v.id === view.id ? { ...v, ...patch } : v));
		try {
			await applySettings({ views });
		} catch (err) {
			toast.error((err as Error).message);
		}
	}

	function pinCategory(ids: string[], categoryPin: CategoryPin) {
		sel.clear();
		return pinItems(ids, categoryPin, categoryGroups);
	}

	function leaveRows(set: Set<string>) {
		const after = navigable.slice(Math.max(0, selectedIndex)).find((i) => !set.has(i.id));
		if (selectedId && set.has(selectedId)) selectedId = after?.id ?? null;
		sel.clear();
	}

	function toggleMute(ids: string[]) {
		leaveRows(new Set(ids));
		return toggleMuteItems(ids);
	}

	function snooze(ids: string[], choice: SnoozeChoice) {
		leaveRows(new Set(ids));
		return snoozeItems(ids, choice);
	}

	function unsnooze(ids: string[]) {
		leaveRows(new Set(ids));
		return unsnoozeItems(ids);
	}

	const toggleSnooze = (ids: string[]) =>
		showSnoozed ? unsnooze(ids) : snooze(ids, UNTIL_NEW_ACTIVITY);

	function markAllRead() {
		const ids = visibleItems.filter((i) => i.unread).map((i) => i.id);
		if (!ids.length) return;
		setItemsRead(ids, true);
		toast(`Marked ${ids.length} as read`);
	}

	function open(i: DashItem, url: string) {
		openOnGitHub(url);
		markItemsSeen([i.id]);
	}

	const copyItemLinks = (ids: string[]) => copyLinks(ids.flatMap((id) => byId(id)?.url ?? []));

	const targets = () => sel.targets(order, selectedId);

	// The list is the right-click menu's trigger, so a click on a row is not "outside" the
	// menu: close it here.
	let contextOpen = $state(false);
	function onRowClick(e: MouseEvent, i: DashItem) {
		contextOpen = false;
		closeRowMenus();
		if (e.currentTarget instanceof HTMLElement) e.currentTarget.focus({ preventScroll: true });
		if (sel.click(e, i.id, order, selectedId)) return;
		sel.clear();
		peekedOutsideKey = null;
		selectedId = i.id;
		if (opensFullPage) openFullPage(i);
		else take();
	}

	const opensFullPage = $derived(me.data?.settings.openItems === 'page');
	const openFullPage = (i: DashItem) => goto(itemPagePath(i.repo, i.number, i.kind));

	function onToggle(e: MouseEvent, i: DashItem) {
		if (e.shiftKey) sel.range(order, i.id, selectedId);
		else sel.toggle(i.id);
		selectedId = i.id;
	}

	function move(delta: number, extend = false) {
		if (!navigable.length) return;
		peekedOutsideKey = null;
		if (extend && selectedId) sel.ids.add(selectedId);
		const n =
			selectedIndex < 0 ? 0 : Math.min(Math.max(selectedIndex + delta, 0), navigable.length - 1);
		selectedId = navigable[n].id;
		if (extend) sel.ids.add(selectedId);
		// Moving with the peek open shows the new row there (this page takes the peek over).
		if (peekOpen && !owns) take();
	}

	function onKey(e: KeyboardEvent) {
		if (ignoreKey(e) || keyActivatesFocusedControl(e)) return;
		const cmd = commandFor(e, VIEW_KEY_SCOPES);
		if (!cmd) return;
		const i = navigable[selectedIndex];
		const action = listKeyboardTarget(peek.target, i, targets(), itemsQ.data?.rows ?? []);
		const openTarget = (url: string | undefined) => {
			if (!url || !action.target) return;
			openOnGitHub(url);
			if (action.item) markItemsSeen([action.item.id]);
		};
		const actOnItems = (run: (ids: string[]) => unknown) => {
			if (!action.ids.length) {
				if (peek.target)
					toast('Not in your views', {
						description: 'Snooze, mute, and unread work only for items in your views.'
					});
				return;
			}
			run(action.ids);
		};
		const snoozed = peek.target ? !!action.item?.dismissed : showSnoozed;
		const views = me.data?.settings.views ?? [];
		const options = showingOptions(view);
		// Each command's keys: shared/keymap.ts (and Settings → Keybinds).
		const run: Record<string, () => void> = {
			'list.next': () => move(1),
			'list.prev': () => move(-1),
			'list.extendNext': () => move(1, true),
			'list.extendPrev': () => move(-1, true),
			'list.select': () => i && sel.toggle(i.id),
			'list.selectAll': () => sel.all(order),
			'list.peek': () => (peekOpen ? closePeek() : i && take()),
			'list.escape': () => (peekOpen ? closePeek() : sel.clear()),
			'list.open': () => openTarget(action.actionUrl),
			'list.openGitHub': () => openTarget(action.target?.url),
			'list.fullPage': () => action.fullPagePath && goto(action.fullPagePath),
			'list.copy': () => copyLinks(action.urls),
			'list.refresh': () => refresh(),
			'list.search': () => (palette.open = true),
			'list.help': () => (helpOpen = true),
			'dash.snooze': () =>
				actOnItems((ids) => (snoozed ? unsnooze(ids) : snooze(ids, UNTIL_NEW_ACTIVITY))),
			'dash.snoozeTomorrow': () =>
				!snoozed &&
				actOnItems((ids) =>
					snooze(ids, { until: snoozeOptions().find((o) => o.id === 'tomorrow')!.until })
				),
			'dash.showSnoozed': () => (showSnoozed = !showSnoozed),
			'dash.mute': () => actOnItems(toggleMute),
			'dash.read': () => actOnItems(toggleItemsRead),
			'dash.stackUp': () => stepStack(1),
			'dash.stackDown': () => stepStack(-1),
			'dash.kind': () =>
				options.length > 1 && show(options[(options.indexOf(showing) + 1) % options.length])
		};
		views.slice(0, 9).forEach((v, n) => (run[`dash.view.${n + 1}`] = () => goto(`/v/${v.id}`)));
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

	// Menus and ⌘K commands (see dash-actions.ts) read the dashboard through this context.
	// Swipe actions on touch screens (Settings → General → Swipe actions; shared/swipe.ts).
	function swipeSide(side: 'left' | 'right', i: DashItem): SwipeSide | null {
		switch (me.data?.settings.swipe.dash[side] ?? 'none') {
			case 'snooze':
				return {
					label: i.dismissed ? 'Wake up' : 'Snooze',
					icon: i.dismissed ? AlarmClockOff : AlarmClock,
					tone: 'bg-signal-review text-white',
					leaves: true,
					run: () => (i.dismissed ? unsnooze([i.id]) : snooze([i.id], UNTIL_NEW_ACTIVITY))
				};
			case 'read':
				return {
					label: i.unread ? 'Read' : 'Unread',
					icon: i.unread ? MailOpen : Mail,
					tone: 'bg-primary text-primary-foreground',
					leaves: false,
					run: () => setItemsRead([i.id], !!i.unread)
				};
			case 'mute':
				return {
					label: i.muted ? 'Unmute' : 'Mute',
					icon: BellOff,
					tone: 'bg-muted-foreground text-background',
					leaves: true,
					run: () => toggleMute([i.id])
				};
		}
		return null;
	}

	const actions: DashActionContext = {
		get noun() {
			return noun;
		},
		get showSnoozed() {
			return showSnoozed;
		},
		get unreadCount() {
			return unreadCount;
		},
		get groupBy() {
			return groupBy;
		},
		get hasSections() {
			return hasSections;
		},
		setGroupBy,
		get sort() {
			return viewSort;
		},
		setSort,
		get order() {
			return order;
		},
		get menu() {
			return me.data?.settings.menus.dash;
		},
		get categoryGroups() {
			return categoryGroups;
		},
		get projects() {
			return projects;
		},
		pinCategory,
		sel,
		byId,
		peek: peekThis,
		open,
		toggleMute,
		copyLinks: copyItemLinks,
		refresh,
		toggleShowSnoozed: () => (showSnoozed = !showSnoozed),
		snooze,
		unsnooze,
		snoozeSheet: (ids) => (snoozeSheetIds = ids),
		setRead: setItemsRead,
		markAllRead
	};
	const menuFor = (ids: string[]) => dashMenu(actions, ids);
	$effect(() => palette.register(() => dashCommands(actions, targets())));
</script>

<svelte:window onkeydown={onKey} />

<main data-page class="mx-auto max-w-4xl px-2 pt-3 pb-24 sm:px-4 sm:pt-4">
	<div class="mb-2 flex items-center gap-2">
		<p
			class="flex min-w-0 flex-1 items-center px-1 text-xs whitespace-nowrap text-muted-foreground"
		>
			{#if data && (refreshing || data.refreshing || revalidatingAfterOpen)}
				<span class="inline-flex items-center gap-1"
					><RefreshCw class="size-3 animate-spin" />Updating…</span
				>
			{:else if data}
				Updated {ago(data.fetchedAt)}
				<Tip text="Refresh from GitHub">
					{#snippet children(props)}
						<button
							{...props}
							type="button"
							class="ml-1 rounded p-0.5 hover:bg-muted hover:text-foreground"
							aria-label="Refresh from GitHub"
							onclick={refresh}><RefreshCw class="size-3" /></button
						>
					{/snippet}
				</Tip>
			{:else}Loading from GitHub…{/if}
		</p>
		<div class="ml-auto flex items-center gap-1">
			{#if snoozedCount || showSnoozed}
				<Button
					variant={showSnoozed ? 'secondary' : 'ghost'}
					size="sm"
					aria-pressed={showSnoozed}
					onclick={() => (showSnoozed = !showSnoozed)}
				>
					<AlarmClock /><span class="hidden sm:inline">Hidden</span>
					{#if snoozedCount}<span class="tabular-nums opacity-70">{snoozedCount}</span>{/if}
				</Button>
			{/if}
			<DisplayMenu
				{groupBy}
				{groupByName}
				{groupByChoices}
				{setGroupBy}
				sort={viewSort}
				{setSort}
				{editSectionsPath}
				{hasSections}
				{noProjectAccess}
				{keepClosed}
				{setKeepClosed}
				{closedLabel}
			/>
			<KindSelect
				kinds={viewKinds(view)}
				shown={kinds}
				count={countIn}
				onchange={(next) => show(next.length > 1 ? 'both' : next[0])}
			/>
			<MarkFilter groups={categoryGroups} count={categoryCount} bind:value={categoryFilter} />
		</div>
	</div>

	{#each failedKinds as k (k)}
		{@const error = queryOf(k).error}
		<Alert.Root variant="destructive" class="mb-3">
			<Alert.Title>Could not load {kindNoun(k)}</Alert.Title>
			<Alert.Description>
				{error?.message}
				<span class="mt-1 flex">
					<button
						type="button"
						class="underline underline-offset-2 hover:text-foreground disabled:opacity-60"
						disabled={queryOf(k).isFetching}
						onclick={() => queryOf(k).refetch()}
						>{queryOf(k).isFetching ? 'Retrying…' : 'Retry'}</button
					>
				</span>
			</Alert.Description>
		</Alert.Root>
	{/each}
	{#each data?.errors ?? [] as err (err)}
		{@const help = tokenHelp(err)}
		<!-- A known token limit is advice, not a failure: the other results are all here. You can
		     hide advice for good (per note); a failed search always shows. -->
		{#if !help || !dismissedNotes.keys.includes(help.title)}
			<Alert.Root variant={help ? 'default' : 'destructive'} class="mb-3">
				<Alert.Title>{help?.title ?? 'A search failed'}</Alert.Title>
				<Alert.Description>
					{help?.body ?? err}
					{#if help}
						<span class="mt-1 flex flex-wrap gap-x-3">
							<a class="underline underline-offset-2" href="/settings/general#token"
								>GitHub access settings</a
							>
							<button
								type="button"
								class="underline underline-offset-2 hover:text-foreground"
								onclick={() => dismissNote(help.title)}>Don't show again</button
							>
						</span>
					{/if}
				</Alert.Description>
			</Alert.Root>
		{/if}
	{/each}
	{#each data?.skipped ?? [] as note (note)}
		<p class="mb-2 px-1 text-xs text-signal-warn">{note}</p>
	{/each}

	{#if pending}
		<div class="grid grid-cols-[minmax(0,1fr)] gap-0.5" aria-hidden="true">
			{#each [0, 1, 2, 3, 4] as k (k)}
				{#if tableLayout}
					<div class="flex h-9 items-center gap-2 border-b border-border/50 px-2">
						<Skeleton class="size-5 shrink-0 rounded-full" />
						<Skeleton class="h-3 flex-1" />
						<Skeleton class="h-3 w-8 shrink-0" />
					</div>
				{:else}
					<div
						class="flex items-start gap-2.5 rounded-xl border border-transparent px-2 py-2.5 sm:gap-3 sm:px-3 sm:py-3"
					>
						<Skeleton class="size-7 shrink-0 rounded-full sm:size-8" />
						<div class="min-w-0 flex-1">
							<div class="flex h-5 items-center"><Skeleton class="h-3.5 w-2/3" /></div>
							<div class="mt-0.5 flex h-4 items-center"><Skeleton class="h-3 w-1/3" /></div>
							<div class="mt-1 flex h-5 items-center sm:mt-1.5">
								<Skeleton class="h-4 w-24 rounded-md" />
							</div>
						</div>
					</div>
				{/if}
			{/each}
		</div>
	{:else if !filtered.length && !listKept}
		{#if categoryFilter.length && shownPopulation.length}
			<div
				class="flex flex-col items-center justify-center rounded-2xl border border-dashed py-20 text-center"
				in:fade={LIST_SWAP}
			>
				<FunnelX class="mb-3 size-8 text-muted-foreground" />
				<p class="font-medium">No items match these filters.</p>
				<Button variant="outline" size="sm" class="mt-3" onclick={() => (categoryFilter = [])}
					>Clear filters</Button
				>
			</div>
		{:else if everyKindAnswered}
			<div
				class="flex flex-col items-center justify-center rounded-2xl border border-dashed py-20 text-center"
				in:fade={LIST_SWAP}
			>
				<CircleCheck class="mb-3 size-8 text-signal-merge" />
				{#if showSnoozed}
					<p class="font-medium">Nothing is snoozed or muted.</p>
				{:else}
					<p class="font-medium">No open {noun} in {view.name}.</p>
					<p class="mt-1 text-sm text-muted-foreground">
						<a class="underline" href="/settings/views#view-{view.id}">Edit its searches</a> to find more.
					</p>
				{/if}
			</div>
		{/if}
	{:else}
		<ContextMenu.Root bind:open={contextOpen}>
			<ContextMenu.Trigger>
				{#snippet child({ props })}
					<div {...props} oncontextmenucapture={onContextMenu}>
						{#key listShape}
							<div class="grid gap-5" in:fade={LIST_SWAP} bind:this={groupsEl}>
								{#each listed as section (section.key)}
									{@const closed = isCollapsed(section.key)}
									<section
										animate:flipGroup={FLIP}
										out:slide={ROW_OUT}
										onoutrostart={outroStarted}
										onoutroend={outroEnded}
									>
										{#if section.label}
											<button
												class="mb-1 flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left"
												onclick={() => {
													groupMotion = true;
													setCollapsed(section.key, !closed);
												}}
												aria-expanded={!closed}
											>
												<ChevronDown
													class={cn(
														'size-3.5 text-muted-foreground',
														groupMotion && 'transition-transform',
														closed && '-rotate-90'
													)}
												/>
												{#if section.color}
													<span
														class={cn(
															'size-2 shrink-0 rounded-full',
															MARK_DOT[statusColor(section.color)]
														)}
													></span>
												{/if}
												<h2 class="truncate text-xs font-semibold tracking-wide uppercase">
													{section.label}
												</h2>
												<span class="text-xs text-muted-foreground tabular-nums"
													>{section.units.length}</span
												>
											</button>
										{/if}
										{#if !closed}
											<!-- Opening or closing a section slides it; the rows' own transitions are local,
									     so they do not also play. -->
											<ul
												transition:slide={groupMotion ? SECTION_SLIDE : { duration: 0 }}
												class="relative grid grid-cols-[minmax(0,1fr)] gap-0.5"
												role="listbox"
												aria-multiselectable="true"
												aria-label={section.label || view.name}
											>
												{#each section.units as unit (unit.key)}
													<li
														animate:flipInGroup={FLIP}
														in:fly={{ y: -8, duration: 200 }}
														out:slide={ROW_OUT}
														onoutrostart={outroStarted}
														onoutroend={outroEnded}
													>
														{#if unit.stack}
															{@render stackRow(unit.stack)}
														{:else}
															{@render itemRow(unit.item)}
														{/if}
													</li>
												{/each}
											</ul>
										{/if}
									</section>
								{/each}
							</div>
						{/key}
					</div>
				{/snippet}
			</ContextMenu.Trigger>
			<ContextMenu.Content class="w-64">
				<AppMenu entries={menuFor(menuIds)} kind="context" />
			</ContextMenu.Content>
		</ContextMenu.Root>
	{/if}
</main>

<LayoutOffer />

<BulkBar count={sel.size} onclear={() => sel.clear()}>
	<SnoozeButton
		snoozed={showSnoozed}
		subjects={targets().map((x) => byId(x)?.kind ?? 'other')}
		labelClass="hidden sm:inline"
		onpick={(choice) => snooze(targets(), choice)}
		onwake={() => unsnooze(targets())}
	/>
	<Button
		variant="ghost"
		size="sm"
		aria-label="Mark as read or unread"
		onclick={() => toggleItemsRead(targets())}
		><MailOpen /><span class="hidden sm:inline">Read</span></Button
	>
	<Button variant="ghost" size="sm" aria-label="Copy links" onclick={() => copyItemLinks(targets())}
		><Link /><span class="hidden sm:inline">Copy links</span></Button
	>
</BulkBar>

{#snippet itemRow(i: DashItem, stack?: Stack)}
	<SwipeRow left={swipeSide('left', i)} right={swipeSide('right', i)}>
		{@const rowProps = {
			item: i,
			marks: marksFor(i),
			selected: i.id === selectedId && !peekedOutsideMember,
			checked: sel.has(i.id),
			selecting: sel.size > 0,
			onopen: open,
			onsnooze: (x: DashItem) => toggleSnooze([x.id]),
			onmute: (x: DashItem) => toggleMute([x.id]),
			oncopy: (x: DashItem) => copyItemLinks([x.id]),
			onrowclick: (e: MouseEvent) => onRowClick(e, i),
			ontoggle: (e: MouseEvent) => onToggle(e, i),
			menu: () => menuFor([i.id]),
			stack: stack && {
				position: positionIn(stack, i.id) + 1,
				size: stack.membersBottomFirst.length
			}
		}}
		{#if tableLayout}
			<DashTableRow {...rowProps} columns={tableColumns} />
		{:else}
			<DashRow {...rowProps} hidden={hiddenPartsOf(i)} />
		{/if}
	</SwipeRow>
{/snippet}

{#snippet stackMember(stack: Stack, m: StackMember)}
	{#if m.itemInList}
		{@render itemRow(m.itemInList, stack)}
	{:else}
		<StackOutsideRow
			member={m}
			position={positionIn(stack, m.key) + 1}
			size={stack.membersBottomFirst.length}
			table={tableLayout}
			selected={peekedOutsideMember?.key === m.key || (cursorIsIn(stack) && !peekedOutsideMember)}
			onclick={() => peekOutside(stack, m)}
		/>
	{/if}
{/snippet}

{#snippet stackRow(stack: Stack)}
	{@const front = rotated(stack)[0]}
	<div class="grid grid-cols-[minmax(0,1fr)] overflow-y-clip *:min-w-0 *:[grid-area:1/1]">
		{#key front.key}
			<div in:rotateIn={rotationDirection} out:rotateOut={rotationDirection}>
				{@render stackMember(stack, front)}
			</div>
		{/key}
	</div>
{/snippet}

{#snippet peekHeader()}
	{#if peekStack && peekCurrentKey}
		{@const stack = peekStack}
		<StackStrip {stack} currentKey={peekCurrentKey} onpick={(m) => pickInStrip(stack, m)} />
	{/if}
	{#if peekedOutsideMember}
		<p class="border-b px-4 py-3 text-sm text-muted-foreground">
			Not in this list. It is in the same stack as the PRs around it.
		</p>
	{/if}
	{#if peekItem}
		{@const i = peekItem}
		<ItemWhyLine
			item={i}
			lead={i.muted ? 'Muted' : i.dismissed ? 'Snoozed' : sectionLabelOf(i.id)}
			shown={peekChanges.current}
		/>
	{/if}
{/snippet}

{#snippet peekFooter()}
	{#if peekItem}
		{@const i = peekItem}
		<SnoozeButton
			snoozed={!!i.dismissed}
			subjects={[i.kind]}
			disabled={alreadyTrue(i)}
			labelClass="max-sm:sr-only"
			onpick={(choice) => snooze([i.id], choice)}
			onwake={() => unsnooze([i.id])}
		/>
		<Button variant="ghost" size="sm" aria-label="Copy link" onclick={() => copyItemLinks([i.id])}
			><Link /><span class="max-sm:sr-only">Copy link</span></Button
		>
	{/if}
{/snippet}

<ShortcutsDialog
	bind:open={helpOpen}
	shortcuts={shortcutsFor(['global', ...VIEW_KEY_SCOPES, 'peek'], LIST_MOUSE)}
/>

<PeekHost />

{#if snoozeSheetIds}
	{@const ids = snoozeSheetIds}
	{@const one = ids.length === 1 ? byId(ids[0]) : undefined}
	<SnoozeSheet
		bind:open={() => snoozeSheetIds !== null, (open) => !open && (snoozeSheetIds = null)}
		subjects={ids.map((x) => byId(x)?.kind ?? 'other')}
		disabled={one ? alreadyTrue(one) : []}
		onpick={(choice) => snooze(ids, choice)}
	/>
{/if}
