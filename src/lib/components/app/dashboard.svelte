<script lang="ts">
	import PeekHost from '$lib/components/app/peek-host.svelte';
	import { closeRowMenus } from '$lib/row-menus.svelte';
	import { untrack } from 'svelte';
	import {
		dashCommands,
		dashMenu,
		UNTIL_NEW_ACTIVITY,
		type DashActionContext
	} from '$lib/dash-actions';
	import { snoozeLabel, type SnoozeChoice } from '$lib/shared/item-snooze';
	import { alreadyTrue } from '$lib/shared/snooze';
	import { snoozeOptions } from '$lib/time';
	import SnoozeButton from './snooze-button.svelte';
	import SnoozeSheet from './snooze-sheet.svelte';
	import ShortcutsDialog from '$lib/components/app/shortcuts-dialog.svelte';
	import { LIST_MOUSE, shortcutsFor } from '$lib/shortcuts';
	import { commandFor, keysOf } from '$lib/keys.svelte';
	import { itemPagePath } from '$lib/shared/item-page';
	import { goto } from '$app/navigation';
	import { flip } from 'svelte/animate';
	import { fly, slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { toast } from 'svelte-sonner';
	import { createQuery } from '@tanstack/svelte-query';
	import { api } from '$lib/api';
	import { dashQuery, keys, queryClient, refetchUnlessLive, setSettings } from '$lib/queries';
	import { applySettings } from '$lib/save-settings';
	import { dismissNote, dismissedNotes } from '$lib/dismissed-notes.svelte';
	import { Selection } from '$lib/selection.svelte';
	import { tokenHelp } from '$lib/token-help';
	import { sortItems } from '$lib/shared/dashboard';
	import {
		groupByLabel,
		groupByOptions,
		groupItems,
		projectsHolding,
		type GroupByOption
	} from '$lib/shared/grouping';
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
		DashResponse,
		GroupBy,
		ItemView
	} from '$lib/shared/types';
	import { viewKinds } from '$lib/shared/item-views';
	import { page } from '$app/state';
	import { ago } from '$lib/time';
	import { cn } from '$lib/utils';
	import {
		matchesCategoryFilter,
		type CategoryFilter,
		type CategoryPin
	} from '$lib/shared/categories';
	import { rowMarks, type RowMark } from '$lib/marks';
	import MarkFilter from './marks/mark-filter.svelte';
	import PillRow, { type Pill } from './pill-row.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Alert from '$lib/components/ui/alert';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import DashRow from './dash-row.svelte';
	import { palette } from '$lib/palette.svelte';
	import AppMenu from './app-menu.svelte';
	import { meQuery } from '$lib/queries';
	import { openOnGitHub } from '$lib/recheck';
	import {
		claimPeek,
		closePeek,
		linkedPeekTarget,
		peek,
		releasePeekHoldUnlessOn
	} from '$lib/peek.svelte';
	import { keepHeldRow } from '$lib/shared/held-row';
	import WhyLine from './why-line.svelte';
	import SwipeRow, { type SwipeSide } from './swipe-row.svelte';
	import { since } from '$lib/time';
	import BulkBar from './bulk-bar.svelte';
	import JevNotice from './jev-notice.svelte';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Pencil from '@lucide/svelte/icons/pencil';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import AlarmClock from '@lucide/svelte/icons/alarm-clock';
	import AlarmClockOff from '@lucide/svelte/icons/alarm-clock-off';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import Mail from '@lucide/svelte/icons/mail';
	import MailOpen from '@lucide/svelte/icons/mail-open';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Link from '@lucide/svelte/icons/link';
	import Rows3 from '@lucide/svelte/icons/rows-3';
	import Check from '@lucide/svelte/icons/check';

	let { view }: { view: ItemView } = $props();
	type Showing = DashKind | 'both';
	const SHOWING_LABELS: Record<Showing, string> = {
		pr: 'Pull requests',
		issue: 'Issues',
		both: 'Both'
	};
	const showingOptions = (v: ItemView): Showing[] => {
		const kinds = viewKinds(v);
		return kinds.length > 1 ? [...kinds, 'both'] : kinds;
	};
	const showingKey = (id: string) => `hush:view-kind:${id}`;
	function readShowing(v: ItemView): Showing {
		const options = showingOptions(v);
		const asked = page.url.searchParams.get('show') ?? localStorage.getItem(showingKey(v.id));
		return options.find((k) => k === asked) ?? options[0] ?? 'pr';
	}
	let showing = $state<Showing>(readShowing(untrack(() => view)));
	$effect(() => {
		const v = view;
		void page.url.searchParams.get('show');
		untrack(() => (showing = readShowing(v)));
	});
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

	const prQ = createQuery(() => ({
		...dashQuery('pr'),
		enabled: viewKinds(view).includes('pr')
	}));
	const issueQ = createQuery(() => ({
		...dashQuery('issue'),
		enabled: viewKinds(view).includes('issue')
	}));
	const queryOf = (k: DashKind) => (k === 'pr' ? prQ : issueQ);
	const shownQueries = $derived(kinds.map(queryOf));
	const me = createQuery(meQuery);
	const data = $derived.by(() => {
		const answers = shownQueries.map((q) => q.data);
		if (answers.some((d) => !d)) return null;
		const ds = answers as DashResponse[];
		return {
			items: ds.flatMap((d) => d.items),
			errors: [...new Set(ds.flatMap((d) => d.errors))],
			skipped: [
				...new Set(ds.flatMap((d) => d.sections.filter((s) => s.id === view.id && s.skipped)))
			].map((s) => s.skipped!),
			fetchedAt: Math.min(...ds.map((d) => d.fetchedAt)),
			refreshing: ds.some((d) => d.refreshing),
			projects: ds.some((d) => d.projects)
				? [...new Map(ds.flatMap((d) => d.projects ?? []).map((p) => [p.key, p] as const)).values()]
				: undefined
		};
	});
	const pageOpenedAt = Date.now();
	const fetching = $derived(shownQueries.some((q) => q.isFetching));
	const revalidatingAfterOpen = $derived(
		fetching && shownQueries.some((q) => q.dataUpdatedAt < pageOpenedAt)
	);
	const loadError = $derived(shownQueries.find((q) => q.isError)?.error ?? null);
	const pending = $derived(shownQueries.some((q) => q.isPending));
	const dashKeys = (k: DashKind[] = viewKinds(view)) => k.map((x) => keys.dash(x));
	const cancelDash = () =>
		Promise.all(dashKeys().map((queryKey) => queryClient.cancelQueries({ queryKey })));
	const invalidateDash = () =>
		dashKeys().forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
	const refetchDash = () => dashKeys().forEach((queryKey) => refetchUnlessLive(queryKey));
	function patchItems(ids: Set<string>, patch: (x: DashItem) => DashItem) {
		for (const queryKey of dashKeys())
			queryClient.setQueryData<DashResponse>(queryKey, (old) =>
				old ? { ...old, items: old.items.map((x) => (ids.has(x.id) ? patch(x) : x)) } : old
			);
	}
	let refreshing = $state(false);
	let categoryFilter = $state<CategoryFilter | null>(null);
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

	const inView = (i: DashItem) => i.sections.includes(view.id);
	const visibleItems = $derived((data?.items ?? []).filter((i) => !i.dismissed && inView(i)));
	const categoryCount = (filter: CategoryFilter) =>
		visibleItems.filter((i) => matchesCategoryFilter(i.categories, filter, categoryGroups)).length;
	const hiddenPartsOf = (i: DashItem) => me.data?.settings.rows[i.kind] ?? [];

	const snoozedCount = $derived(data?.items.filter((i) => i.dismissed && inView(i)).length ?? 0);
	const unreadCount = $derived(visibleItems.filter((i) => i.unread).length);

	const peekOwner = $derived(`view:${view.id}:${showing}`);
	const owns = $derived(peek.owner === peekOwner);
	let filteredBefore: DashItem[] = [];
	const filtered = $derived.by(() => {
		const listed = (data?.items ?? []).filter(
			(i) =>
				i.dismissed === showSnoozed &&
				inView(i) &&
				(!categoryFilter || matchesCategoryFilter(i.categories, categoryFilter, categoryGroups))
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
	const heldOutOfKeyboardOrder = (id: string | null) =>
		id !== null && id === peek.heldId && owns && filtered.some((i) => i.id === id);

	const groupBy = $derived(view.groupBy);
	const projects = $derived<DashProject[]>(
		projectsHolding(visibleItems, data?.projects ?? [], groupBy)
	);
	const noProjectAccess = $derived(!!me.data && projectAccessOf(me.data.scopes ?? []) === 'none');
	const groupByChoices = $derived(groupByOptions(categoryGroups, projects));
	const startsNewKind = (choices: GroupByOption[], k: number) =>
		k > 0 && choices[k].kind !== choices[k - 1].kind;
	const groupByName = $derived(groupByLabel(groupBy, categoryGroups, data?.projects ?? []));
	const sections = $derived(
		groupItems(sortItems(filtered), groupBy, {
			me: me.data?.login ?? '',
			categoryGroups,
			projects: data?.projects
		})
	);

	let stackFront = $state<Record<string, string>>({});
	let rotationDirection = $state(0);
	let peekedOutsideKey = $state<string | null>(null);

	const stacks = $derived(
		kinds.includes('pr') ? findStacks(sections.flatMap((section) => section.items)) : []
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

	/** Keyboard order: only rows in open sections. */
	const navigable = $derived(
		listed.flatMap((section) =>
			isCollapsed(section.key) ? [] : section.units.flatMap(visibleItemOfUnit)
		)
	);
	const order = $derived(navigable.map((i) => i.id));
	const selectedIndex = $derived(navigable.findIndex((i) => i.id === selectedId));
	const byId = (id: string) => data?.items.find((i) => i.id === id);

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
	let readByPeek: string | null = null;
	$effect(() => {
		const i = peekItem;
		if (i?.id === readByPeek) return;
		readByPeek = i?.id ?? null;
		if (i?.unread) untrack(() => markSeenHere([i.id]));
	});
	$effect(() => {
		void showing;
		const v = view;
		untrack(() => {
			categoryFilter = null;
			selectedId = null;
			sel.clear();
			groupMotion = false;
			collapsedChoice = readCollapsed(v);
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
		const key = (owns && peekedOutsideMember?.key) || selectedId;
		const stack = key ? stackOf.get(key) : undefined;
		if (!stack || !key) return;
		const next = stack.membersBottomFirst[positionIn(stack, key) + direction];
		if (next) showStackMember(stack, next, direction);
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

	/** Force the server to search GitHub again (skips its 5-minute cache). */
	async function refresh() {
		refreshing = true;
		try {
			await Promise.all(
				kinds.map((k) =>
					queryClient.fetchQuery({
						queryKey: keys.dash(k),
						queryFn: () => api.dashboard(k, true),
						staleTime: 0
					})
				)
			);
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
		if (!r || r.page !== 'view' || r.view !== view.id || !kinds.includes(r.kind) || !data) return;
		const item = data.items.find((x) => x.id === r.id);
		untrack(() => {
			palette.peekRequest = null;
			if (!item) return;
			categoryFilter = null;
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
	$effect(() => {
		const linked = linkedPeekTarget();
		const item = linked
			? data?.items.find((i) => i.repo === linked.repo && i.number === linked.number)
			: null;
		if (!item) return;
		untrack(() => {
			palette.peekRequest = { page: 'view', view: view.id, kind: item.kind, id: item.id };
		});
	});

	const countIn = (k: DashKind) =>
		(queryOf(k).data?.items ?? []).filter((i) => !i.dismissed && inView(i)).length;
	const showingPills = $derived<Pill[]>(
		showingOptions(view).map((option) => {
			const count =
				option === 'both' ? viewKinds(view).reduce((n, k) => n + countIn(k), 0) : countIn(option);
			return { id: option, label: SHOWING_LABELS[option], count, dim: !count };
		})
	);

	async function setGroupBy(by: GroupBy) {
		const settings = me.data?.settings;
		if (!settings || by === view.groupBy) return;
		const views = settings.views.map((v) => (v.id === view.id ? { ...v, groupBy: by } : v));
		setSettings({ ...settings, views });
		try {
			await applySettings({ views });
		} catch (err) {
			setSettings(settings);
			toast.error((err as Error).message);
		}
	}

	async function pin(
		ids: string[],
		categoryPin: CategoryPin,
		patch: (x: DashItem) => DashItem,
		message: string
	) {
		await cancelDash();
		patchItems(new Set(ids), patch);
		sel.clear();
		try {
			await api.pinItems(ids, categoryPin);
			toast(message, {
				description: ids.length === 1 ? byId(ids[0])?.title : `${ids.length} ${noun}`
			});
			refetchDash();
		} catch (err) {
			toast.error((err as Error).message);
			invalidateDash();
		}
	}

	function pinCategory(ids: string[], categoryPin: CategoryPin) {
		const group = categoryGroups.find((g) => g.id === categoryPin.group);
		const chosen = group?.categories.find((c) => c.id === categoryPin.category);
		if (!group || !chosen)
			return pin(ids, categoryPin, (x) => x, 'Hush chooses the category again');
		const inGroup = new Set(group.categories.map((c) => c.id));
		const replace = (list: string[] | undefined) => [
			...(list ?? []).filter((c) => !inGroup.has(c)),
			chosen.id
		];
		return pin(
			ids,
			categoryPin,
			(x) => ({
				...x,
				categories: replace(x.categories),
				pinnedCategories: replace(x.pinnedCategories)
			}),
			`${group.name}: ${chosen.name}`
		);
	}

	function leaveRows(set: Set<string>) {
		const after = navigable.slice(Math.max(0, selectedIndex)).find((i) => !set.has(i.id));
		if (selectedId && set.has(selectedId)) selectedId = after?.id ?? null;
		sel.clear();
	}

	const describe = (items: DashItem[]) =>
		items.length === 1 ? items[0].title : `${items.length} items`;

	async function toggleMute(ids: string[]) {
		const items = ids.map(byId).filter((i): i is DashItem => !!i);
		if (!items.length) return;
		const mute = !items[0].muted;
		const set = new Set(items.map((i) => i.id));
		leaveRows(set);
		await cancelDash();
		patchItems(set, (x) => ({ ...x, dismissed: mute, muted: mute, snooze: undefined }));
		try {
			if (mute) await api.muteItems([...set]);
			else await api.unsnoozeItems([...set]);
			toast(mute ? 'Muted' : 'Unmuted', {
				description: describe(items),
				action: mute
					? {
							label: 'Undo',
							onClick: () => {
								api
									.unsnoozeItems([...set])
									.then(invalidateDash)
									.catch((e) => toast.error(e.message));
							}
						}
					: undefined
			});
		} catch (err) {
			invalidateDash();
			toast.error((err as Error).message);
		}
	}

	async function snooze(ids: string[], choice: SnoozeChoice) {
		const items = ids.map(byId).filter((i): i is DashItem => !!i);
		if (!items.length) return;
		const set = new Set(items.map((i) => i.id));
		leaveRows(set);
		await cancelDash();
		patchItems(set, (x) => ({ ...x, dismissed: true, muted: false, snooze: choice }));
		try {
			await api.snoozeItems(
				items.map((i) => ({ id: i.id, updatedAt: i.updatedAt })),
				choice
			);
			toast(`Snoozed ${snoozeLabel(choice).replace(/^Until/, 'until')}`, {
				description: describe(items),
				action: {
					label: 'Undo',
					onClick: () => {
						patchItems(set, (x) => ({ ...x, dismissed: false, snooze: undefined }));
						api.unsnoozeItems([...set]).catch((e) => {
							toast.error(e.message);
							invalidateDash();
						});
					}
				}
			});
		} catch (err) {
			invalidateDash();
			toast.error((err as Error).message);
		}
	}

	async function unsnooze(ids: string[]) {
		const items = ids.map(byId).filter((i): i is DashItem => !!i);
		if (!items.length) return;
		const set = new Set(items.map((i) => i.id));
		leaveRows(set);
		await cancelDash();
		patchItems(set, (x) => ({ ...x, dismissed: false, muted: false, snooze: undefined }));
		try {
			await api.unsnoozeItems([...set]);
			toast('Back in the list', { description: describe(items) });
		} catch (err) {
			invalidateDash();
			toast.error((err as Error).message);
		}
	}

	const toggleSnooze = (ids: string[]) =>
		showSnoozed ? unsnooze(ids) : snooze(ids, UNTIL_NEW_ACTIVITY);

	const SEEN_BATCH = 50;
	function sendInBatches(keys: string[], send: (batch: string[]) => Promise<unknown>) {
		const batches = Array.from({ length: Math.ceil(keys.length / SEEN_BATCH) }, (_, k) =>
			keys.slice(k * SEEN_BATCH, (k + 1) * SEEN_BATCH)
		);
		return Promise.all(batches.map(send));
	}

	function markSeenHere(ids: string[]) {
		patchItems(new Set(ids), (x) => ({ ...x, unread: false }));
		sendInBatches(ids, api.seen).catch(() => invalidateDash());
	}

	async function setRead(ids: string[], read: boolean) {
		const set = new Set(ids);
		patchItems(set, (x) => ({
			...x,
			unread: !read,
			...(read ? { seenAt: Date.now(), changes: [] } : { seenAt: null })
		}));
		try {
			await sendInBatches(ids, read ? api.seen : api.unseen);
		} catch (err) {
			invalidateDash();
			toast.error((err as Error).message);
		}
	}

	function markAllRead() {
		const ids = visibleItems.filter((i) => i.unread).map((i) => i.id);
		if (!ids.length) return;
		setRead(ids, true);
		toast(`Marked ${ids.length} as read`);
	}

	function open(i: DashItem, url: string) {
		openOnGitHub(url);
		markSeenHere([i.id]);
	}

	async function copyLinks(ids: string[]) {
		const urls = ids
			.map(byId)
			.filter(Boolean)
			.map((i) => i!.url);
		await navigator.clipboard.writeText(urls.join('\n'));
		toast.success(urls.length === 1 ? 'Link copied' : `${urls.length} links copied`);
	}

	const targets = () => sel.targets(order, selectedId);

	// The list is the right-click menu's trigger, so a click on a row is not "outside" the
	// menu: close it here.
	let contextOpen = $state(false);
	function onRowClick(e: MouseEvent, i: DashItem) {
		contextOpen = false;
		closeRowMenus();
		if (sel.click(e, i.id, order, selectedId)) return;
		// A click on the card peeks it.
		sel.clear();
		peekedOutsideKey = null;
		selectedId = i.id;
		take();
	}

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
		const target = e.target;
		if (
			target instanceof Element &&
			target.closest('input, textarea, [contenteditable], [role="menu"], [role="dialog"]')
		)
			return;
		const cmd = commandFor(e, ['list', 'dash']);
		if (!cmd) return;
		const i = navigable[selectedIndex];
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
			'list.peek': () => i && (owns ? closePeek() : take()),
			'list.escape': () => (peekOpen ? closePeek() : sel.clear()),
			'list.open': () => i && open(i, i.actionUrl),
			'list.openGitHub': () => i && open(i, i.url),
			'list.fullPage': () => i && goto(itemPagePath(i.repo, i.number, i.kind)),
			'list.copy': () => copyLinks(targets()),
			'list.refresh': () => refresh(),
			'list.search': () => (palette.open = true),
			'list.help': () => (helpOpen = true),
			'dash.snooze': () => toggleSnooze(targets()),
			'dash.snoozeTomorrow': () =>
				!showSnoozed &&
				snooze(targets(), { until: snoozeOptions().find((o) => o.id === 'tomorrow')!.until }),
			'dash.showSnoozed': () => (showSnoozed = !showSnoozed),
			'dash.mute': () => toggleMute(targets()),
			'dash.read': () => {
				const ids = targets();
				setRead(
					ids,
					ids.some((x) => byId(x)?.unread)
				);
			},
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
					run: () => (i.dismissed ? unsnooze([i.id]) : snooze([i.id], UNTIL_NEW_ACTIVITY))
				};
			case 'read':
				return {
					label: i.unread ? 'Read' : 'Unread',
					icon: i.unread ? MailOpen : Mail,
					tone: 'bg-primary text-primary-foreground',
					run: () => setRead([i.id], !!i.unread)
				};
			case 'mute':
				return {
					label: i.muted ? 'Unmute' : 'Mute',
					icon: BellOff,
					tone: 'bg-muted-foreground text-background',
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
		setGroupBy,
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
		copyLinks,
		refresh,
		toggleShowSnoozed: () => (showSnoozed = !showSnoozed),
		snooze,
		unsnooze,
		snoozeSheet: (ids) => (snoozeSheetIds = ids),
		setRead,
		markAllRead
	};
	const menuFor = (ids: string[]) => dashMenu(actions, ids);
	$effect(() => palette.register(() => dashCommands(actions, targets())));
</script>

<svelte:window onkeydown={onKey} />

<main data-page class="mx-auto max-w-4xl px-2 pt-3 pb-24 sm:px-4 sm:pt-4">
	<div class="flex items-center gap-2">
		<div class="min-w-0 flex-1">
			<PillRow
				pills={showingPills}
				bind:value={() => showing, (k) => k && show(k as Showing)}
				label="Pull requests or issues"
				action={{
					label: `Edit ${view.name}`,
					href: `/settings/views#view-${view.id}`,
					icon: Pencil
				}}
			/>
		</div>
		<div class="ml-auto flex items-center gap-1">
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="ghost" size="sm" aria-label="Group by {groupByName}">
							<Rows3 /><span class="hidden max-w-48 truncate sm:inline">{groupByName}</span>
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="min-w-60">
					<DropdownMenu.Label>Group by</DropdownMenu.Label>
					{#each groupByChoices as o, k (o.id)}
						{#if startsNewKind(groupByChoices, k)}
							<DropdownMenu.Separator />
						{/if}
						<DropdownMenu.Item onclick={() => setGroupBy(o.id)}>
							<span class="flex-1">{o.label}</span>
							{#if o.id === groupBy}<Check class="size-3.5" />{/if}
						</DropdownMenu.Item>
					{/each}
					{#if noProjectAccess}
						<DropdownMenu.Separator />
						<DropdownMenu.Item disabled class="text-xs">
							Project status needs project access
						</DropdownMenu.Item>
					{/if}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
			<Button
				variant={showSnoozed ? 'secondary' : 'ghost'}
				size="sm"
				onclick={() => (showSnoozed = !showSnoozed)}
				disabled={!snoozedCount && !showSnoozed}
			>
				<AlarmClock /><span class="hidden sm:inline"
					>{showSnoozed ? 'Showing snoozed' : 'Snoozed'}</span
				>
				{#if snoozedCount}<span class="tabular-nums opacity-70">{snoozedCount}</span>{/if}
			</Button>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Refresh from GitHub"
				onclick={refresh}
				disabled={refreshing}
			>
				<RefreshCw class={cn(refreshing && 'animate-spin')} />
			</Button>
			<MarkFilter groups={categoryGroups} count={categoryCount} bind:value={categoryFilter} />
		</div>
	</div>

	<p class="mt-2 mb-2 flex h-4 items-center px-1 text-xs text-muted-foreground">
		{#if data && (refreshing || data.refreshing || revalidatingAfterOpen)}
			<span class="inline-flex items-center gap-1"
				><RefreshCw class="size-3 animate-spin" />Updating…</span
			>
		{:else if data}
			Updated {ago(data.fetchedAt)}
		{:else}Loading from GitHub…{/if}
	</p>

	<JevNotice />
	{#if loadError}
		<Alert.Root variant="destructive" class="mb-3"
			><Alert.Description>{loadError.message}</Alert.Description></Alert.Root
		>
	{/if}
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
		<div class="grid gap-2">
			{#each [0, 1, 2, 3, 4] as k (k)}
				<div class="flex items-center gap-3 px-3 py-3">
					<Skeleton class="size-8 rounded-full" />
					<div class="grid flex-1 gap-2">
						<Skeleton class="h-4 w-2/3" />
						<Skeleton class="h-3 w-1/3" />
					</div>
				</div>
			{/each}
		</div>
	{:else if !filtered.length}
		<div
			class="flex flex-col items-center justify-center rounded-2xl border border-dashed py-20 text-center"
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
	{:else}
		<ContextMenu.Root bind:open={contextOpen}>
			<ContextMenu.Trigger>
				{#snippet child({ props })}
					<div {...props} class="grid gap-5" oncontextmenucapture={onContextMenu}>
						{#each listed as section (section.key)}
							{@const closed = isCollapsed(section.key)}
							<section>
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
												animate:flip={FLIP}
												in:fly={{ y: -8, duration: 200 }}
												out:slide={{ duration: 200, easing: cubicOut }}
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
				{/snippet}
			</ContextMenu.Trigger>
			<ContextMenu.Content class="w-64">
				<AppMenu entries={menuFor(menuIds)} kind="context" />
			</ContextMenu.Content>
		</ContextMenu.Root>
	{/if}
</main>

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
		onclick={() => {
			const ids = targets();
			setRead(
				ids,
				ids.some((x) => byId(x)?.unread)
			);
		}}><MailOpen /><span class="hidden sm:inline">Read</span></Button
	>
	<Button variant="ghost" size="sm" aria-label="Copy links" onclick={() => copyLinks(targets())}
		><Link /><span class="hidden sm:inline">Copy links</span></Button
	>
</BulkBar>

{#snippet itemRow(i: DashItem, stack?: Stack)}
	<SwipeRow left={swipeSide('left', i)} right={swipeSide('right', i)}>
		<DashRow
			item={i}
			marks={marksFor(i)}
			hidden={hiddenPartsOf(i)}
			selected={i.id === selectedId && !peekedOutsideMember}
			checked={sel.has(i.id)}
			selecting={sel.size > 0}
			onopen={open}
			onsnooze={(x) => toggleSnooze([x.id])}
			onmute={(x) => toggleMute([x.id])}
			oncopy={(x) => copyLinks([x.id])}
			onrowclick={(e) => onRowClick(e, i)}
			ontoggle={(e) => onToggle(e, i)}
			menu={() => menuFor([i.id])}
			stack={stack && {
				position: positionIn(stack, i.id) + 1,
				size: stack.membersBottomFirst.length
			}}
		/>
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
		<WhyLine
			lead={i.muted ? 'Muted' : i.dismissed ? 'Snoozed' : sectionLabelOf(i.id)}
			text={i.turn === 'none' ? i.turnReason : `${i.turnReason}, for ${since(i.waitingSince)}`}
			changes={i.changes ?? []}
			seenAt={i.seenAt ?? null}
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
		<Button variant="ghost" size="sm" aria-label="Copy link" onclick={() => copyLinks([i.id])}
			><Link /><span class="max-sm:sr-only">Copy link</span></Button
		>
	{/if}
{/snippet}

<ShortcutsDialog
	bind:open={helpOpen}
	shortcuts={shortcutsFor(['global', 'list', 'dash', 'peek'], LIST_MOUSE)}
/>

<PeekHost />

{#if snoozeSheetIds}
	{@const ids = snoozeSheetIds}
	<SnoozeSheet
		bind:open={() => snoozeSheetIds !== null, (open) => !open && (snoozeSheetIds = null)}
		subjects={ids.map((x) => byId(x)?.kind ?? 'other')}
		untilNewActivity
		onpick={(choice) => snooze(ids, choice)}
	/>
{/if}
