<script lang="ts">
	import { tick } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { onNavigate } from '$app/navigation';
	import { PEEK_PARAM } from '$lib/shared/peek-link';
	import { subjectKey } from '$lib/shared/subject';
	import { DOCKED_PANEL_QUERY } from './side-panel.svelte';

	const ITEM_ROUTE_MARK = '[number=item_number]';
	const RUNNING_CLASS = 'item-transition';
	const SIZE_STYLE_ID = 'item-transition-sizes';
	const DURATION_MS = 300;
	const DOCK_DELAY_MS = 90;
	const EASE_OUT = 'cubic-bezier(0.33, 1, 0.68, 1)';
	const EASE_IN_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)';
	const SETTLE_LIMIT_MS = 500;
	const READY_ATTR = 'data-item-ready';
	const HANDOFF_OFFSET = 0.85;
	const DOCK_HIDDEN = 'translateY(150%)';
	const PANEL = "aside[aria-label='peek']";
	const ITEM_PAGE = '[data-item-page]';
	const CONTENT_ANCHOR = 'header.grid';

	const HEADER_PARTS = [
		{ name: 'header-logo', selector: '[data-header-bar] > a' },
		{ name: 'header-nav', selector: '[data-header-bar] > div:nth-child(2)' },
		{ name: 'header-actions', selector: '[data-header-bar] > div:last-child' }
	];

	type Box = { left: number; top: number; width: number; height: number };
	type Snapshot = {
		parts: Record<string, Box | null>;
		surface: Box | null;
		anchor: Box | null;
		panel: Box | null;
		dock: Box | null;
		pageScroll: number;
	};

	const panelDocks = new MediaQuery(DOCKED_PANEL_QUERY);

	const isItemRoute = (id: string | null | undefined) => !!id?.includes(ITEM_ROUTE_MARK);
	const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

	function boxOf(selector: string): Box | null {
		const rect = document.querySelector(selector)?.getBoundingClientRect();
		return rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null;
	}

	function snapshot(): Snapshot {
		const onItemPage = !!document.querySelector(ITEM_PAGE);
		const surfaceSelector = onItemPage ? ITEM_PAGE : PANEL;
		return {
			parts: Object.fromEntries(HEADER_PARTS.map((part) => [part.name, boxOf(part.selector)])),
			surface: boxOf(surfaceSelector),
			anchor: boxOf(`${surfaceSelector} ${CONTENT_ANCHOR}`),
			panel: boxOf(PANEL),
			dock: boxOf('[data-item-dock]'),
			pageScroll: onItemPage ? window.scrollY : 0
		};
	}

	function sizeRules(side: 'old' | 'new', shot: Snapshot) {
		const named: [string, Box | null][] = [
			...HEADER_PARTS.map((part): [string, Box | null] => [part.name, shot.parts[part.name]]),
			['item-surface', shot.surface],
			['item-dock', shot.dock]
		];
		return named
			.filter((entry): entry is [string, Box] => entry[1] !== null)
			.map(
				([name, box]) =>
					`html.${RUNNING_CLASS}::view-transition-${side}(${name}) { width: ${box.width}px; height: ${box.height}px; }`
			)
			.join('\n');
	}

	function writeSizes(css: string) {
		let style = document.getElementById(SIZE_STYLE_ID);
		if (!style) {
			style = document.createElement('style');
			style.id = SIZE_STYLE_ID;
			document.head.append(style);
		}
		style.textContent = css;
	}

	function itemPageReadySelector(key: string) {
		const ready = `[${READY_ATTR}="${CSS.escape(key)}"]`;
		return `${ITEM_PAGE}${ready}, ${ITEM_PAGE} ${ready}`;
	}

	function finishSurfaceAnimations() {
		for (const surface of document.querySelectorAll(`${PANEL}, ${ITEM_PAGE}`)) {
			for (const animation of surface.getAnimations()) {
				const end = animation.effect?.getComputedTiming().endTime;
				if (typeof end === 'number' && Number.isFinite(end)) animation.finish();
			}
		}
	}

	async function settle(itemKey: string | null) {
		const ready = itemKey
			? () => !!document.querySelector(itemPageReadySelector(itemKey))
			: () =>
					!new URL(location.href).searchParams.has(PEEK_PARAM) ||
					!!document.querySelector(`${PANEL} [${READY_ATTR}]`);
		const start = performance.now();
		while (!ready() && performance.now() - start < SETTLE_LIMIT_MS) await frame();
		finishSurfaceAnimations();
	}

	function animatePseudo(
		pseudoElement: string,
		keyframes: Keyframe[],
		options: KeyframeAnimationOptions = {}
	) {
		document.documentElement.animate(keyframes, {
			duration: DURATION_MS,
			easing: EASE_OUT,
			fill: 'both',
			...options,
			pseudoElement
		});
	}

	const hide = (pseudoElement: string) =>
		animatePseudo(pseudoElement, [{ opacity: 0 }, { opacity: 0 }]);
	const show = (pseudoElement: string) =>
		animatePseudo(pseudoElement, [{ opacity: 1 }, { opacity: 1 }]);

	function slideHeader(before: Snapshot, after: Snapshot, easing: string) {
		for (const { name } of HEADER_PARTS) {
			const from = before.parts[name];
			const to = after.parts[name];
			if (!from || !to) continue;
			hide(`::view-transition-old(${name})`);
			animatePseudo(
				`::view-transition-new(${name})`,
				[
					{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` },
					{ transform: 'none' }
				],
				{ easing }
			);
		}
	}

	function openFromPanel(before: Snapshot, after: Snapshot) {
		show('::view-transition-old(root)');
		hide('::view-transition-new(root)');
		hide('::view-transition-old(item-surface)');
		const page = after.surface;
		const panel = before.panel;
		if (!page || !panel) {
			animatePseudo('::view-transition-new(item-surface)', [
				{ transform: 'translateX(48px)', opacity: 0 },
				{ transform: 'none', opacity: 1 }
			]);
			return;
		}
		const dx = (before.anchor?.left ?? panel.left) - (after.anchor?.left ?? page.left);
		const pageTop = (after.anchor?.top ?? page.top) + after.pageScroll;
		const dy = (before.anchor?.top ?? pageTop) - pageTop;
		const hiddenStrip = Math.max(0, panel.left - (page.left + dx));
		animatePseudo('::view-transition-new(item-surface)', [
			{ transform: `translate(${dx}px, ${dy}px)`, clipPath: `inset(0 0 0 ${hiddenStrip}px)` },
			{ transform: 'none', clipPath: 'inset(0 0 0 0)' }
		]);
	}

	function closeIntoPanel(before: Snapshot, after: Snapshot) {
		hide('::view-transition-old(root)');
		show('::view-transition-new(root)');
		const page = before.surface;
		const panel = after.surface;
		if (!page) return;
		if (!panel || !after.panel) {
			animatePseudo('::view-transition-old(item-surface)', [
				{ transform: 'none', opacity: 1 },
				{ transform: 'translateX(48px)', opacity: 0 }
			]);
			return;
		}
		const groupShift = { x: page.left - panel.left, y: page.top - panel.top };
		const dx = (after.anchor?.left ?? panel.left) - (before.anchor?.left ?? page.left);
		const pageTop = (before.anchor?.top ?? page.top) + before.pageScroll;
		const dy = (after.anchor?.top ?? pageTop) - pageTop;
		const finalStrip = Math.max(0, panel.left - (page.left + dx));
		const start = `translate(${groupShift.x}px, ${groupShift.y}px)`;
		const end = `translate(${groupShift.x + dx}px, ${groupShift.y + dy}px)`;
		animatePseudo(
			'::view-transition-old(item-surface)',
			[
				{ transform: start, clipPath: 'inset(0 0 0 0)', opacity: 1, offset: 0 },
				{
					transform: end,
					clipPath: `inset(0 0 0 ${finalStrip}px)`,
					opacity: 1,
					offset: HANDOFF_OFFSET
				},
				{ transform: end, clipPath: `inset(0 0 0 ${finalStrip}px)`, opacity: 0, offset: 1 }
			],
			{ easing: EASE_IN_OUT }
		);
		animatePseudo(
			'::view-transition-new(item-surface)',
			[
				{ opacity: 0, offset: 0 },
				{ opacity: 0, offset: HANDOFF_OFFSET },
				{ opacity: 1, offset: 1 }
			],
			{ easing: 'linear' }
		);
	}

	function moveDock(toItem: boolean) {
		if (toItem)
			animatePseudo(
				'::view-transition-new(item-dock)',
				[{ transform: DOCK_HIDDEN }, { transform: 'none' }],
				{ delay: DOCK_DELAY_MS, duration: DURATION_MS - DOCK_DELAY_MS }
			);
		else
			animatePseudo(
				'::view-transition-old(item-dock)',
				[
					{ transform: 'none', opacity: 1 },
					{ transform: DOCK_HIDDEN, opacity: 0 }
				],
				{ duration: DURATION_MS / 2 }
			);
	}

	onNavigate((navigation) => {
		if (!document.startViewTransition || !panelDocks.current) return;
		const toItem = isItemRoute(navigation.to?.route.id);
		if (isItemRoute(navigation.from?.route.id) === toItem) return;
		const target = navigation.to?.params;
		const itemKey =
			toItem && target ? subjectKey(`${target.owner}/${target.repo}`, Number(target.number)) : null;
		const root = document.documentElement;
		const before = snapshot();
		root.classList.add(RUNNING_CLASS);
		return new Promise<void>((resolve) => {
			const transition = document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
				await tick();
				await settle(itemKey);
				writeSizes(`${sizeRules('old', before)}\n${sizeRules('new', snapshot())}`);
			});
			transition.ready
				.then(() => {
					const after = snapshot();
					slideHeader(before, after, toItem ? EASE_OUT : EASE_IN_OUT);
					if (toItem) openFromPanel(before, after);
					else closeIntoPanel(before, after);
					moveDock(toItem);
				})
				.catch(() => {});
			transition.finished.finally(() => root.classList.remove(RUNNING_CLASS));
		});
	});
</script>

<style>
	:global(html.item-transition [data-page]),
	:global(html.item-transition [data-header-bar]),
	:global(html.item-transition [data-item-dock]),
	:global(html.item-transition aside[aria-label='peek']) {
		transition: none !important;
	}
	:global(html.item-transition [data-header-bar] > a) {
		view-transition-name: header-logo;
	}
	:global(html.item-transition [data-header-bar] > div:nth-child(2)) {
		view-transition-name: header-nav;
	}
	:global(html.item-transition [data-header-bar] > div:last-child) {
		view-transition-name: header-actions;
	}
	:global(html.item-transition aside[aria-label='peek']),
	:global(html.item-transition [data-item-page]) {
		view-transition-name: item-surface;
	}
	:global(html.item-transition [data-item-dock]) {
		view-transition-name: item-dock;
	}
	:global(html.item-transition::view-transition-group(*)) {
		animation: none;
	}
	:global(html.item-transition::view-transition-old(*)),
	:global(html.item-transition::view-transition-new(*)) {
		animation: none;
		object-fit: none;
		object-position: left top;
	}
</style>
