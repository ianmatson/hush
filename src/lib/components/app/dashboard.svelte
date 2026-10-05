<script lang="ts">
	import { closeRowMenus } from '$lib/row-menus.svelte';
	import { untrack } from 'svelte';
	import {
		dashCommands,
		dashMenu,
		type DashActionContext,
		type TurnGroup
	} from '$lib/dash-actions';
	import ShortcutsDialog from '$lib/components/app/shortcuts-dialog.svelte';
	import { DASH_MOUSE, shortcutsFor } from '$lib/shortcuts';
	import { commandFor, keysOf } from '$lib/keys.svelte';
	import { flip } from 'svelte/animate';
	import { fly, slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { toast } from 'svelte-sonner';
	import { createQuery } from '@tanstack/svelte-query';
	import { ListDrag } from '$lib/drag.svelte';
	import { api } from '$lib/api';
	import { dashQuery, keys, queryClient } from '$lib/queries';
	import { dismissNote, dismissedNotes } from '$lib/dismissed-notes.svelte';
	import { Selection } from '$lib/selection.svelte';
	import { tokenHelp } from '$lib/token-help';
	import { arrangeGroup, orderAfterDrop } from '$lib/shared/dashboard';
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
	import type { DashItem, DashKind, DashResponse, Turn } from '$lib/shared/types';
	import { ago } from '$lib/time';
	import { cn } from '$lib/utils';
	import type { Classification } from '$lib/shared/types';
	import { itemQueryFacts } from '$lib/shared/categories';
	import { exprMatches, NOTIFICATION_WORDS, parseExpr } from '$lib/shared/query';
	import { ruleMatches } from '$lib/shared/classify';
	import { rowMarks, type RowMark } from '$lib/marks';
	import MarkFilter from './marks/mark-filter.svelte';
	import FilterBuilder from './rules/filter-builder.svelte';
	import { previewItems, ruleSuggestions } from '$lib/rule-preview';
	import PillRow, { type Pill } from './pill-row.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Alert from '$lib/components/ui/alert';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import DashRow from './dash-row.svelte';
	import { palette } from '$lib/palette.svelte';
	import AppMenu from './app-menu.svelte';
	import { meQuery } from '$lib/queries';
	import { openOnGitHub } from '$lib/recheck';
	import { claimPeek, closePeek, peek } from '$lib/peek.svelte';
	import WhyLine from './why-line.svelte';
	import SwipeRow, { type SwipeSide } from './swipe-row.svelte';
	import NotNeededDialog, { type NotNeededTarget } from './not-needed-dialog.svelte';
	import { since } from '$lib/time';
	import BulkBar from './bulk-bar.svelte';
	import JevNotice from './jev-notice.svelte';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Search from '@lucide/svelte/icons/search';
	import Pencil from '@lucide/svelte/icons/pencil';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import Eye from '@lucide/svelte/icons/eye';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import CircleSlash from '@lucide/svelte/icons/circle-slash';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Link from '@lucide/svelte/icons/link';
	import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
	import Undo from '@lucide/svelte/icons/undo-2';

	let { kind }: { kind: DashKind } = $props();
	const noun = $derived(kind === 'pr' ? 'pull requests' : 'issues');
	const FLIP = { duration: 260, easing: cubicOut };
	const SECTION_SLIDE = { duration: 220, easing: cubicOut };

	const dashQ = createQuery(() => dashQuery(kind));
	const me = createQuery(meQuery);
	const data = $derived(dashQ.data ?? null);
	const pageOpenedAt = Date.now();
	const revalidatingAfterOpen = $derived(dashQ.isFetching && dashQ.dataUpdatedAt < pageOpenedAt);
	let refreshing = $state(false);
	let section = $state<string | null>(null);
	let categoryFilter = $state<string | null>(null);
	let tagFilter = $state<string | null>(null);
	let query = $state('');
	let showHidden = $state(false);
	let selectedId = $state<string | null>(null);
	let helpOpen = $state(false);
	let searchEl = $state<HTMLInputElement | null>(null);
	// Collapsed groups are read at once (not after the first paint), and they slide only after
	// you open or close one: a page that loads shows them as they are, with no motion.
	const readCollapsed = (k: DashKind): Record<Turn, boolean> => {
		const base = { you: false, team: false, them: false, none: true };
		try {
			return { ...base, ...JSON.parse(localStorage.getItem(`hush:collapsed:${k}`) ?? '{}') };
		} catch {
			return base;
		}
	};
	let collapsed = $state<Record<Turn, boolean>>(readCollapsed(untrack(() => kind)));
	let groupMotion = $state(false);
	const sel = new Selection();

	const ALL_GROUPS: TurnGroup[] = [
		{ turn: 'you', label: 'Your turn', hint: 'You are the next person who must act.' },
		{
			turn: 'team',
			label: "Your team's turn",
			hint: 'A review is requested from a team you are in.'
		},
		{ turn: 'them', label: 'Waiting on others', hint: 'You did your part. Someone else must act.' },
		{ turn: 'none', label: 'Other', hint: 'Drafts, and threads that only mention you.' }
	];
	// Only a team review request makes it the team's turn, and only PRs have review requests (GitHub
	// assigns issues to people, not teams). Issues show the group only if you moved one there.
	const GROUPS = $derived(
		kind === 'pr' || dashQ.data?.items.some((i) => i.turn === 'team')
			? ALL_GROUPS
			: ALL_GROUPS.filter((g) => g.turn !== 'team')
	);
	const groupLabel = (t: Turn) => ALL_GROUPS.find((g) => g.turn === t)!.label;

	const categories = $derived(me.data?.settings.categories ?? []);
	const tags = $derived(me.data?.settings.tags ?? []);

	const marksFor = (i: DashItem): RowMark[] => rowMarks(i.category, i.tags, me.data?.settings);

	const visibleItems = $derived((data?.items ?? []).filter((i) => !i.dismissed));
	const categoryCount = (id: string) => visibleItems.filter((i) => i.category === id).length;
	const tagCount = (id: string) => visibleItems.filter((i) => i.tags?.includes(id)).length;
	const hiddenParts = $derived(me.data?.settings.rows[kind] ?? []);

	const sectionNames = $derived(
		Object.fromEntries((data?.sections ?? []).map((s) => [s.id, s.name]))
	);
	const hiddenCount = $derived(data?.items.filter((i) => i.dismissed).length ?? 0);

	const queryExpr = $derived.by(() => {
		if (!query.includes(':')) return null;
		const parsed = parseExpr(query);
		return parsed.errors.length ? null : parsed.expr;
	});
	function matchesQuery(i: DashItem, q: string) {
		const settings = me.data?.settings;
		if (queryExpr && settings) {
			const facts = itemQueryFacts(i, me.data!.login, settings);
			const c = { category: 'fyi', kind: 'none' } as Classification;
			return exprMatches(queryExpr, (when) => ruleMatches(when, facts, c));
		}
		return `${i.title} ${i.repo} ${i.author} ${i.turnReason} ${i.labels.map((l) => l.name).join(' ')}`
			.toLowerCase()
			.includes(q);
	}

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return (data?.items ?? []).filter(
			(i) =>
				i.dismissed === showHidden &&
				(!section || i.sections.includes(section)) &&
				(!categoryFilter || i.category === categoryFilter) &&
				(!tagFilter || !!i.tags?.includes(tagFilter)) &&
				(!q || matchesQuery(i, q))
		);
	});

	/** Groups in display order: new items on top, then your manual order. */
	const arrangedGroups = $derived(
		GROUPS.map((g) => ({
			...g,
			items: arrangeGroup(filtered.filter((i) => i.turn === g.turn))
		}))
	);

	let stackFront = $state<Record<string, string>>({});
	let rotationDirection = $state(0);
	let peekedOutsideKey = $state<string | null>(null);

	const stacks = $derived(kind === 'pr' ? findStacks(arrangedGroups.flatMap((g) => g.items)) : []);
	const stackOf = $derived(stackByMember(stacks));
	const rotated = (s: Stack) => rotateToFront(s, stackFront[s.bottomKey]);
	const inListMembers = (members: StackMember[]) =>
		members.flatMap((m) => (m.itemInList ? [m.itemInList] : []));
	const itemsOfUnit = (u: ListUnit) => (u.stack ? inListMembers(rotated(u.stack)) : [u.item]);
	const visibleItemOfUnit = (u: ListUnit) => itemsOfUnit(u).slice(0, 1);

	const baseGroups = $derived(
		arrangedGroups.map((g) => {
			const units = unitsOf(g.items, stackOf);
			return { ...g, units, items: units.flatMap(itemsOfUnit) };
		})
	);

	// --- Drag and drop ----------------------------------------------------------------
	const drag = new ListDrag({
		enabled: () => !showHidden,
		// Dragging a selected row moves the whole selection, in list order.
		pick: (id) => {
			const stack = stackOf.get(id);
			if (stack) return inListMembers(rotated(stack)).map((i) => i.id);
			return sel.has(id) && sel.size > 1 ? sel.targets(order, id) : [id];
		},
		isCollapsed: (zone) => collapsed[zone as Turn],
		drop: (ids, zone, index) => dropAt(ids, zone as Turn, index)
	});
	const dragging = $derived(new Set(drag.ids));

	/** Rows to render: dragged rows leave their lists; the placeholder opens where they land. */
	const groups = $derived(
		baseGroups.map((g) => {
			const rows: Row[] = g.units
				.filter((u) => !itemsOfUnit(u).some((i) => dragging.has(i.id)))
				.map((u) => ({ key: u.key, unit: u }));
			if (drag.active && drag.zone === g.turn && !collapsed[g.turn])
				rows.splice(Math.min(drag.index, rows.length), 0, { key: '__placeholder', unit: null });
			return { ...g, rows };
		})
	);

	/** Keyboard order: only rows in open groups. */
	const navigable = $derived(
		baseGroups.flatMap((g) => (collapsed[g.turn] ? [] : g.units.flatMap(visibleItemOfUnit)))
	);
	const order = $derived(navigable.map((i) => i.id));
	const selectedIndex = $derived(navigable.findIndex((i) => i.id === selectedId));
	const byId = (id: string) => data?.items.find((i) => i.id === id);

	// --- Peek: one panel for the app (lib/peek.svelte.ts); follows the cursor while this page
	// owns it ------------------------------------------------------------------------------
	const peekOwner = $derived(kind === 'pr' ? 'pulls' : 'issues');
	const owns = $derived(peek.owner === peekOwner);
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
		const row = navigable[selectedIndex] ?? null;
		return owns && !peekedOutsideMember ? row : null;
	});
	const peekCurrentKey = $derived(peekedOutsideMember?.key ?? peekItem?.id ?? null);
	const peekStack = $derived(peekCurrentKey ? (stackOf.get(peekCurrentKey) ?? null) : null);
	// Looking at it in the peek for a moment: "since you looked" starts again (when there is
	// something to reset).
	$effect(() => {
		const i = peekItem;
		if (!i || (i.seenAt && !i.changes?.length)) return;
		const timer = setTimeout(() => api.seen([i.id]).catch(() => {}), 1500);
		return () => clearTimeout(timer);
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

	/** `index` counts the visible rows left in the group once the dragged rows are out. */
	function dropAt(ids: string[], turn: Turn, index: number) {
		const left = (baseGroups.find((g) => g.turn === turn)?.units ?? []).filter(
			(u) => !itemsOfUnit(u).some((i) => ids.includes(i.id))
		);
		const idsOf = (units: ListUnit[]) => units.flatMap((u) => itemsOfUnit(u).map((i) => i.id));
		const visible = [...idsOf(left.slice(0, index)), ...ids, ...idsOf(left.slice(index))];
		return arrange(ids, turn, orderAfterDrop(fullGroup(turn), visible, ids));
	}

	// Enter and leave animations that know about dragging.
	type Row = { key: string; unit: ListUnit | null };
	function enter(node: Element, r: Row) {
		if (!r.unit)
			return drag.fresh ? { duration: 0 } : slide(node, { duration: 200, easing: cubicOut });
		if (drag.settling) {
			// The dropped stack unfolds: the first card is already in place, the rest slide out of it.
			const k = drag.unfold.indexOf(r.unit.item.id);
			return k < 0
				? { duration: 0 }
				: fly(node, { y: -28, opacity: 0, duration: 320, delay: 35 * k, easing: cubicOut });
		}
		if (drag.active) return { duration: 0 };
		return fly(node, { y: -8, duration: 200 });
	}
	function leave(node: Element, r: Row) {
		if (!r.unit)
			return drag.settling ? { duration: 0 } : slide(node, { duration: 200, easing: cubicOut });
		// Rows lifted by a drag vanish at once: the floating card stands in for them.
		if (drag.active || drag.settling) return { duration: 0 };
		return slide(node, { duration: 200, easing: cubicOut });
	}

	/** Full order of a group, including rows hidden by the current filter. */
	const fullGroup = (turn: Turn) =>
		arrangeGroup(
			(data?.items ?? []).filter((i) => i.turn === turn && i.dismissed === showHidden)
		).map((i) => i.id);

	function dropped(id: string, turn: Turn, visible: string[]) {
		// Dragging a selected row moves the whole selection, in list order.
		const moved = sel.has(id) && sel.size > 1 ? sel.targets(order, id) : [id];
		const block = new Set(moved);
		const vis = visible.filter((x) => x === id || !block.has(x));
		vis.splice(vis.indexOf(id), 1, ...moved);
		const before = fullGroup(turn);
		const next = orderAfterDrop(before, vis, moved);
		const sameGroup = moved.every((m) => byId(m)?.turn === turn);
		if (sameGroup && next.join() === before.join()) return;
		arrange(moved, turn, next);
	}

	/**
	 * Move items into a group at a given order: update the cache now, then save.
	 * `turn` null undoes your moves (back to Hush's group).
	 */
	async function arrange(ids: string[], turn: Turn | null, groupOrder?: string[]) {
		const items = ids.map(byId).filter((i): i is DashItem => !!i);
		if (!items.length) return;
		const prev = new Map(items.map((i) => [i.id, i]));
		const target = (i: DashItem) => turn ?? i.autoTurn;
		const rank = new Map((groupOrder ?? []).map((x, n) => [x, n]));
		await queryClient.cancelQueries({ queryKey: keys.dash(kind) });
		const set = (fn: (x: DashItem) => DashItem) =>
			queryClient.setQueryData<DashResponse>(keys.dash(kind), (old) =>
				old ? { ...old, items: old.items.map(fn) } : old
			);
		set((x) =>
			prev.has(x.id)
				? {
						...x,
						turn: target(x),
						movedByYou: target(x) !== x.autoTurn,
						rank: rank.get(x.id) ?? x.rank
					}
				: rank.has(x.id)
					? { ...x, rank: rank.get(x.id)! }
					: x
		);
		sel.clear();
		// Save in the background: a drop must finish its one visual update without waiting.
		void persistArrange(items, target, groupOrder, prev, turn, set);
	}

	async function persistArrange(
		items: DashItem[],
		target: (i: DashItem) => Turn,
		groupOrder: string[] | undefined,
		prev: Map<string, DashItem>,
		turn: Turn | null,
		set: (fn: (x: DashItem) => DashItem) => void
	) {
		try {
			await api.arrange(
				items.map((i) => ({
					id: i.id,
					updatedAt: i.updatedAt,
					// Same group: leave any move as it is. Back to Hush's group: undo the move.
					turn: target(i) === i.turn ? undefined : target(i) === i.autoTurn ? null : target(i)
				})),
				groupOrder ?? []
			);
			if (items.some((i) => i.turn !== target(i)))
				toast(turn ? `Moved to “${groupLabel(turn)}”` : 'Back in its own group', {
					description: items.length === 1 ? items[0].title : `${items.length} items`,
					action: {
						label: 'Undo',
						onClick: () => {
							set((x) => prev.get(x.id) ?? x);
							api
								.arrange(
									items.map((i) => ({
										id: i.id,
										updatedAt: i.updatedAt,
										turn: i.movedByYou ? i.turn : null
									})),
									[]
								)
								.catch((err) => toast.error(err.message));
						}
					}
				});
		} catch (err) {
			toast.error((err as Error).message);
			queryClient.invalidateQueries({ queryKey: keys.dash(kind) });
		}
	}

	// --- Everything else --------------------------------------------------------------
	$effect(() => {
		if (!navigable.some((i) => i.id === selectedId)) {
			const stack = selectedId ? stackOf.get(selectedId) : undefined;
			const standIn = stack && navigable.find((i) => stackOf.get(i.id) === stack);
			selectedId = standIn?.id ?? navigable[0]?.id ?? null;
		}
		untrack(() => sel.prune(order));
	});

	/** Force the server to search GitHub again (skips its 5-minute cache). */
	async function refresh() {
		refreshing = true;
		try {
			await queryClient.fetchQuery({
				queryKey: keys.dash(kind),
				queryFn: () => api.dashboard(kind, true),
				staleTime: 0
			});
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			refreshing = false;
		}
	}

	$effect(() => {
		const k = kind;
		untrack(() => {
			section = null;
			categoryFilter = null;
			tagFilter = null;
			selectedId = null;
			sel.clear();
			groupMotion = false;
			collapsed = readCollapsed(k);
		});
	});
	// (After the effect above, which resets the cursor when the page opens.)
	// The command palette chose an item on this dashboard: show it (clear filters, open its
	// group) and peek it.
	$effect(() => {
		const r = palette.peekRequest;
		if (!r || r.page !== (kind === 'pr' ? 'pulls' : 'issues') || !data) return;
		const item = data.items.find((x) => x.id === r.id);
		untrack(() => {
			palette.peekRequest = null;
			if (!item) return;
			query = '';
			section = null;
			categoryFilter = null;
			tagFilter = null;
			showHidden = !!item.dismissed;
			sel.clear();
			peekedOutsideKey = null;
			const stackLead = stackOf.get(item.id)?.mostUrgentInList;
			collapsed[(stackLead ?? item).turn] = false;
			revealInStack(item.id);
			selectedId = item.id;
			take();
		});
	});

	$effect(() => {
		localStorage.setItem(`hush:collapsed:${kind}`, JSON.stringify(collapsed));
	});

	const sourcePills = $derived<Pill[]>(
		[{ id: null, name: 'All' }, ...(data?.sections ?? [])].map((s) => {
			const count = sectionCount(s.id);
			return { id: s.id, label: s.name, count, dim: !count };
		})
	);

	function sectionCount(id: string | null) {
		return (data?.items ?? []).filter((i) => !i.dismissed && (!id || i.sections.includes(id)))
			.length;
	}

	function setDismissed(ids: Set<string>, dismissed: boolean) {
		queryClient.setQueryData<DashResponse>(keys.dash(kind), (old) =>
			old ? { ...old, items: old.items.map((x) => (ids.has(x.id) ? { ...x, dismissed } : x)) } : old
		);
	}

	async function pin(
		ids: string[],
		change: { category?: string | null; tag?: string; tagState?: 'on' | 'off' },
		patch: (x: DashItem) => DashItem,
		message: string
	) {
		const set = new Set(ids);
		await queryClient.cancelQueries({ queryKey: keys.dash(kind) });
		queryClient.setQueryData<DashResponse>(keys.dash(kind), (old) =>
			old ? { ...old, items: old.items.map((x) => (set.has(x.id) ? patch(x) : x)) } : old
		);
		sel.clear();
		try {
			await api.pinItems(ids, change);
			toast(message, {
				description: ids.length === 1 ? byId(ids[0])?.title : `${ids.length} ${noun}`
			});
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			queryClient.invalidateQueries({ queryKey: keys.dash(kind) });
		}
	}

	function setCategory(ids: string[], category: string | null) {
		const name = categories.find((c) => c.id === category)?.name;
		return pin(
			ids,
			{ category },
			(x) => (category ? { ...x, category } : x),
			name ? `Moved to “${name}”` : 'Hush decides the category again'
		);
	}

	function setTag(ids: string[], tag: string, state: 'on' | 'off') {
		const name = tags.find((t) => t.id === tag)?.name ?? tag;
		return pin(
			ids,
			{ tag, tagState: state },
			(x) => ({
				...x,
				tags:
					state === 'on'
						? [...new Set([...(x.tags ?? []), tag])]
						: (x.tags ?? []).filter((t) => t !== tag)
			}),
			state === 'on' ? `Tagged “${name}”` : `Removed “${name}”`
		);
	}

	/** Mute: hidden until you unmute it, and its threads muted (see PollerData.mute). */
	async function toggleMute(ids: string[]) {
		const items = ids.map(byId).filter((i): i is DashItem => !!i);
		if (!items.length) return;
		const mute = !items[0].muted;
		const set = new Set(items.map((i) => i.id));
		const after = navigable.slice(Math.max(0, selectedIndex)).find((i) => !set.has(i.id));
		if (selectedId && set.has(selectedId)) selectedId = after?.id ?? null;
		sel.clear();
		await queryClient.cancelQueries({ queryKey: keys.dash(kind) });
		queryClient.setQueryData<DashResponse>(keys.dash(kind), (old) =>
			old
				? {
						...old,
						items: old.items.map((x) =>
							set.has(x.id) ? { ...x, dismissed: mute, muted: mute } : x
						)
					}
				: old
		);
		try {
			if (mute) await api.muteItems([...set]);
			else await api.unhide([...set]);
			queryClient.invalidateQueries({ queryKey: keys.threadsAll });
			toast(mute ? 'Muted' : 'Unmuted', {
				description: items.length === 1 ? items[0].title : `${items.length} items`,
				action: mute
					? {
							label: 'Undo',
							onClick: () => {
								api
									.unhide([...set])
									.then(() => queryClient.invalidateQueries({ queryKey: keys.dash(kind) }))
									.catch((e) => toast.error(e.message));
							}
						}
					: undefined
			});
		} catch (err) {
			queryClient.invalidateQueries({ queryKey: keys.dash(kind) });
			toast.error((err as Error).message);
		}
	}

	async function toggleHide(ids: string[]) {
		const items = ids.map(byId).filter((i): i is DashItem => !!i);
		if (!items.length) return;
		const hide = !items[0].dismissed;
		const set = new Set(items.map((i) => i.id));
		const after = navigable.slice(Math.max(0, selectedIndex)).find((i) => !set.has(i.id));
		if (selectedId && set.has(selectedId)) selectedId = after?.id ?? null;
		sel.clear();
		await queryClient.cancelQueries({ queryKey: keys.dash(kind) });
		setDismissed(set, hide);
		try {
			if (hide) await api.hide(items.map((i) => ({ id: i.id, updatedAt: i.updatedAt })));
			else await api.unhide([...set]);
			toast(hide ? 'Hidden until it changes' : 'Shown again', {
				description: items.length === 1 ? items[0].title : `${items.length} items`,
				action: hide
					? {
							label: 'Undo',
							onClick: () => {
								setDismissed(set, false);
								api.unhide([...set]).catch((e) => toast.error(e.message));
							}
						}
					: undefined
			});
		} catch (err) {
			setDismissed(set, !hide);
			toast.error((err as Error).message);
		}
	}

	function open(i: DashItem, url: string) {
		openOnGitHub(url);
		api.seen([i.id]).catch(() => {});
	}

	async function copyLinks(ids: string[]) {
		const urls = ids
			.map(byId)
			.filter(Boolean)
			.map((i) => i!.url);
		await navigator.clipboard.writeText(urls.join('\n'));
		toast.success(urls.length === 1 ? 'Link copied' : `${urls.length} links copied`);
	}

	/** Move to the top of another group (menu and bulk bar). */
	function moveTo(ids: string[], turn: Turn) {
		const block = new Set(ids);
		arrange(ids, turn, [
			...order.filter((x) => block.has(x)),
			...fullGroup(turn).filter((x) => !block.has(x))
		]);
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
		) {
			if (e.key === 'Escape' && target === searchEl) searchEl?.blur();
			return;
		}
		const cmd = commandFor(e, ['list', 'dash']);
		if (!cmd) return;
		const i = navigable[selectedIndex];
		const chips = [null, ...(data?.sections ?? []).map((s) => s.id)];
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
			'list.copy': () => copyLinks(targets()),
			'list.refresh': () => refresh(),
			'list.search': () => searchEl?.focus(),
			'list.help': () => (helpOpen = true),
			'dash.hide': () => toggleHide(targets()),
			'dash.showHidden': () => (showHidden = !showHidden),
			'dash.mute': () => toggleMute(targets()),
			'dash.notNeeded': () => i && i.turn === 'you' && !i.dismissed && sayNotNeeded(i),
			'dash.stackUp': () => stepStack(1),
			'dash.stackDown': () => stepStack(-1)
		};
		chips.slice(0, 10).forEach((id, n) => (run[`dash.section.${n}`] = () => (section = id)));
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
			case 'hide':
				return {
					label: i.dismissed ? 'Show again' : 'Hide',
					icon: i.dismissed ? Eye : EyeOff,
					tone: 'bg-signal-review text-white',
					run: () => toggleHide([i.id])
				};
			case 'mute':
				return {
					label: i.muted ? 'Unmute' : 'Mute',
					icon: BellOff,
					tone: 'bg-muted-foreground text-background',
					run: () => toggleMute([i.id])
				};
			case 'not-needed':
				return i.turn === 'you' && !i.dismissed
					? {
							label: 'Not my turn',
							icon: CircleSlash,
							tone: 'bg-foreground text-background',
							run: () => sayNotNeeded(i)
						}
					: null;
		}
		return null;
	}

	// "Not my turn…": Hush was wrong about an item in Your turn (not-needed-dialog.svelte).
	let notNeededFor = $state<NotNeededTarget | null>(null);
	function sayNotNeeded(i: DashItem) {
		notNeededFor = {
			id: i.id,
			title: i.title,
			repo: i.repo,
			review: i.requestedMe,
			team: false,
			bot: i.authorIsBot,
			elsewhere: 'Other'
		};
	}

	const actions: DashActionContext = {
		get noun() {
			return noun;
		},
		get showHidden() {
			return showHidden;
		},
		get groups() {
			return GROUPS;
		},
		get order() {
			return order;
		},
		get menu() {
			return me.data?.settings.menus.dash;
		},
		get categories() {
			return categories;
		},
		get tags() {
			return tags;
		},
		setCategory,
		setTag,
		sel,
		byId,
		peek: peekThis,
		open,
		moveTo,
		arrange,
		toggleHide,
		toggleMute,
		copyLinks,
		refresh,
		toggleShowHidden: () => (showHidden = !showHidden),
		notNeeded: sayNotNeeded
	};
	const menuFor = (ids: string[]) => dashMenu(actions, ids);
	$effect(() => palette.register(() => dashCommands(actions, targets())));
</script>

<svelte:window onkeydown={onKey} />

<main data-page class="mx-auto max-w-4xl px-2 pt-3 pb-24 sm:px-4 sm:pt-4">
	<div class="flex flex-wrap items-center gap-2">
		<div class="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
			<Search
				class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
			/>
			<Input
				bind:ref={searchEl}
				bind:value={query}
				placeholder="Filter {noun}"
				class="h-8 pr-8 pl-8"
				aria-label="Filter {noun}"
			/>
			<FilterBuilder
				bind:value={query}
				id="dash-filter-{kind}"
				exclude={NOTIFICATION_WORDS}
				suggestions={ruleSuggestions(me.data?.settings)}
				preview={(q) =>
					me.data && data ? previewItems(q, me.data.login, me.data.settings, data.items) : null}
			/>
		</div>
		<div class="ml-auto flex items-center gap-1">
			<Button
				variant={showHidden ? 'secondary' : 'ghost'}
				size="sm"
				onclick={() => (showHidden = !showHidden)}
				disabled={!hiddenCount && !showHidden}
			>
				<EyeOff /><span class="hidden sm:inline">{showHidden ? 'Showing hidden' : 'Hidden'}</span>
				{#if hiddenCount}<span class="tabular-nums opacity-70">{hiddenCount}</span>{/if}
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
			<MarkFilter
				kind="category"
				marks={categories}
				count={categoryCount}
				bind:value={categoryFilter}
			/>
			<MarkFilter kind="tag" marks={tags} count={tagCount} bind:value={tagFilter} />
		</div>
	</div>

	{#if data}
		<div class="mt-3">
			<PillRow
				pills={sourcePills}
				bind:value={section}
				label="Sources"
				toggle
				action={{ label: 'Edit sources', href: '/settings/dashboards', icon: Pencil }}
			/>
		</div>
	{/if}

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
	{#if dashQ.isError}
		<Alert.Root variant="destructive" class="mb-3"
			><Alert.Description>{dashQ.error.message}</Alert.Description></Alert.Root
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
	{#each data?.sections.filter((s) => s.skipped) ?? [] as s (s.id)}
		<p class="mb-2 px-1 text-xs text-signal-warn">{s.name}: {s.skipped}</p>
	{/each}

	{#if dashQ.isPending}
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
			{#if query}
				<p class="font-medium">No {noun} match “{query}”.</p>
			{:else if showHidden}
				<p class="font-medium">Nothing is hidden.</p>
			{:else}
				<p class="font-medium">No open {noun} involve you.</p>
				<p class="mt-1 text-sm text-muted-foreground">
					<a class="underline" href="/settings/dashboards">Edit the sources</a> to track more.
				</p>
			{/if}
		</div>
	{:else}
		<ContextMenu.Root bind:open={contextOpen}>
			<ContextMenu.Trigger>
				{#snippet child({ props })}
					<div {...props} class="grid gap-5" data-drag-root oncontextmenucapture={onContextMenu}>
						{#each groups as g (g.turn)}
							{@const count = baseGroups.find((b) => b.turn === g.turn)?.items.length ?? 0}
							{@const target = drag.active && drag.zone === g.turn}
							{@const headerDrop = target && (collapsed[g.turn] || !count)}
							<!-- The whole group (header and rows) is one drop zone. Always in the layout, so
							     picking up a card never shifts the page. -->
							<section data-drag-zone={g.turn}>
								<button
									class={cn(
										'group/h mb-1 flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors duration-150',
										headerDrop && 'bg-primary/[0.07] text-primary'
									)}
									onclick={() => {
										groupMotion = true;
										collapsed[g.turn] = !collapsed[g.turn];
									}}
									aria-expanded={!collapsed[g.turn]}
								>
									<ChevronDown
										class={cn(
											'size-3.5 text-muted-foreground',
											groupMotion && 'transition-transform',
											collapsed[g.turn] && '-rotate-90'
										)}
									/>
									<h2
										class={cn(
											'text-xs font-semibold tracking-wide uppercase',
											!count && !headerDrop && 'text-muted-foreground/70'
										)}
									>
										{g.label}
									</h2>
									<span class="text-xs text-muted-foreground tabular-nums">{count}</span>
									<span
										class={cn(
											'ml-2 hidden truncate text-xs text-muted-foreground opacity-0 transition-opacity group-hover/h:opacity-100 sm:inline',
											headerDrop && 'text-primary opacity-100'
										)}>{headerDrop ? 'Drop to move here' : g.hint}</span
									>
								</button>
								{#if !collapsed[g.turn]}
									<!-- An empty list is 0 px tall; the placeholder opens it when you drag over. -->
									<!-- Opening or closing a group slides it; the rows' own transitions are local, so
									     they do not also play. -->
									<ul
										transition:slide={groupMotion ? SECTION_SLIDE : { duration: 0 }}
										class="relative grid grid-cols-[minmax(0,1fr)] gap-0.5"
										role="listbox"
										aria-multiselectable="true"
										aria-label={g.label}
									>
										{#each g.rows as r (r.key)}
											<li
												animate:flip={FLIP}
												in:enter={r}
												out:leave={r}
												data-drag-id={r.unit?.item.id}
												data-drag-placeholder={!r.unit || undefined}
												style={r.unit ? undefined : `height: ${drag.gap}px`}
												class={r.unit
													? 'drag-row'
													: 'rounded-xl border-2 border-dashed border-primary/25 bg-primary/[0.05]'}
												onpointerdown={(e) =>
													r.unit && drag.pointerdown(e, r.unit.item.id, e.currentTarget)}
											>
												{#if r.unit?.stack}
													{@render stackRow(r.unit.stack)}
												{:else if r.unit}
													{@render itemRow(r.unit.item)}
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

{#if drag.active}
	{@const first = byId(drag.ids[0])}
	{@const lift = drag.lift.current}
	<!-- The card under the pointer. With a selection, the others stack behind it. -->
	<div
		class="pointer-events-none fixed top-0 left-0 z-50 will-change-transform"
		style="width: {drag.width}px; transform-origin: {drag.grab.x}px {drag.grab
			.y}px; transform: translate3d({drag.pos.current.x}px, {drag.pos.current.y}px, 0) scale({1 -
			0.08 * lift});"
	>
		{#each drag.ids.slice(1, 3).reverse() as id, k (id)}
			{@const depth = drag.ids.slice(1, 3).length - k}
			<div
				class="absolute inset-0 rounded-xl border bg-background"
				style="transform: translateY({depth * 10 * lift}px) scale({1 - depth * 0.03}); opacity: {1 -
					depth * 0.22}; box-shadow: 0 6px 16px -10px rgb(0 0 0 / 0.3);"
			></div>
		{/each}
		<div
			class="relative overflow-hidden rounded-xl border bg-background"
			style="box-shadow: 0 {6 + 16 * lift}px {18 + 30 * lift}px -{10 -
				2 * lift}px rgb(0 0 0 / {0.12 + 0.22 * lift});"
		>
			{#if first}
				<DashRow
					item={first}
					marks={marksFor(first)}
					hidden={hiddenParts}
					checked={sel.has(first.id)}
					{sectionNames}
					draggable={false}
					onopen={() => {}}
					onhide={() => {}}
					onmute={() => {}}
					oncopy={() => {}}
					onrowclick={() => {}}
					ontoggle={() => {}}
					onundomove={() => {}}
				/>
			{/if}
		</div>
		{#if drag.ids.length > 1}
			<span class="drag-count" style="transform: scale({0.6 + 0.4 * lift})">{drag.ids.length}</span>
		{/if}
	</div>
{/if}

<BulkBar count={sel.size} onclear={() => sel.clear()}>
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="ghost" size="sm" aria-label="Move to"
					><ArrowRightLeft /><span class="hidden sm:inline">Move to</span></Button
				>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="center" side="top">
			{#each GROUPS as g (g.turn)}
				<DropdownMenu.Item onclick={() => moveTo(targets(), g.turn)}>{g.label}</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
	<Button
		variant="ghost"
		size="sm"
		aria-label={showHidden ? 'Show again' : 'Hide until it changes'}
		onclick={() => toggleHide(targets())}
	>
		{#if showHidden}<Eye /><span class="hidden sm:inline">Show</span>{:else}<EyeOff /><span
				class="hidden sm:inline">Hide</span
			>{/if}
	</Button>
	<Button variant="ghost" size="sm" aria-label="Copy links" onclick={() => copyLinks(targets())}
		><Link /><span class="hidden sm:inline">Copy links</span></Button
	>
</BulkBar>

<NotNeededDialog bind:target={notNeededFor} />

{#snippet itemRow(i: DashItem, stack?: Stack)}
	<SwipeRow left={swipeSide('left', i)} right={swipeSide('right', i)}>
		<DashRow
			item={i}
			marks={marksFor(i)}
			hidden={hiddenParts}
			selected={i.id === selectedId && !peekedOutsideMember}
			checked={sel.has(i.id)}
			selecting={sel.size > 0}
			draggable={!showHidden}
			showSections={!section}
			{sectionNames}
			onopen={open}
			onhide={(x) => toggleHide([x.id])}
			onmute={(x) => toggleMute([x.id])}
			oncopy={(x) => copyLinks([x.id])}
			onrowclick={(e) => onRowClick(e, i)}
			ontoggle={(e) => onToggle(e, i)}
			onundomove={(x) => arrange([x.id], null)}
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
			lead={i.muted ? 'Muted' : i.dismissed ? 'Hidden' : groupLabel(i.turn)}
			text={i.turn === 'none' ? i.turnReason : `${i.turnReason}, for ${since(i.waitingSince)}`}
			changes={i.changes ?? []}
			seenAt={i.seenAt ?? null}
			notes={[
				i.movedByYou && 'You moved it here, until it changes',
				i.sections.length > 0 &&
					`Found by: ${i.sections.map((id) => sectionNames[id] ?? id).join(', ')}`
			]}
		>
			{#snippet actions()}
				{#if i.turn === 'you' && !i.dismissed}
					<Button
						variant="outline"
						size="xs"
						title="Not my turn ({keysOf('dash.notNeeded')[0] ?? ''})"
						onclick={() => sayNotNeeded(i)}>Not my turn</Button
					>
				{/if}
			{/snippet}
		</WhyLine>
	{/if}
{/snippet}

{#snippet peekFooter()}
	{#if peekItem}
		{@const i = peekItem}
		<Button
			variant="ghost"
			size="sm"
			aria-label={i.dismissed ? 'Show again' : 'Hide until it changes'}
			onclick={() => toggleHide([i.id])}
		>
			{#if i.dismissed}<Eye /><span class="max-sm:sr-only">Show again</span>{:else}<EyeOff /><span
					class="max-sm:sr-only">Hide</span
				>{/if}
		</Button>
		<Button variant="ghost" size="sm" aria-label="Copy link" onclick={() => copyLinks([i.id])}
			><Link /><span class="max-sm:sr-only">Copy link</span></Button
		>
	{/if}
{/snippet}

<ShortcutsDialog
	bind:open={helpOpen}
	shortcuts={shortcutsFor(['global', 'list', 'dash', 'peek'], DASH_MOUSE)}
/>
