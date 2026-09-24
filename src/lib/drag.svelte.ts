import { tick } from 'svelte';
import { Spring } from 'svelte/motion';

/**
 * Drag-to-reorder across several lists ("zones"), built for feel:
 * - the card lifts and follows the pointer on a spring;
 * - the rows being dragged leave their lists, and a placeholder as tall as all of them opens
 *   where they will land (other rows animate out of the way with `animate:flip`);
 * - on drop, the card springs into the placeholder and the list takes over.
 *
 * Mouse and pen only. On touch screens a press must scroll the page; the row menus ("Move to")
 * do the same job there.
 *
 * Markup contract: each zone element (a whole group: header and list) has `data-drag-zone="<key>"`;
 * each row wrapper inside it has `data-drag-id="<id>"` and calls `pointerdown`, and its list is
 * `position: relative`. The placeholder has `data-drag-placeholder`. Nothing may change size when a
 * drag starts: zones are always in the layout, so picking up a card never shifts the page.
 */
export interface DragConfig {
	enabled: () => boolean;
	/** The ids that move together when a drag starts on `id` (in list order). */
	pick: (id: string) => string[];
	/** Zones that are closed show no rows; a drop there goes to the top. */
	isCollapsed: (zone: string) => boolean;
	/** Apply the drop. `index` counts only the rows left in the zone (the dragged ones removed). */
	drop: (ids: string[], zone: string, index: number) => Promise<void> | void;
}

const MOUSE_SLOP = 4; // px before a press becomes a drag
const EDGE = 72; // px from the viewport edge where auto-scroll starts
const MAX_SCROLL = 18; // px per frame at the very edge

export class ListDrag {
	/** Dragged ids; empty when idle. */
	ids = $state<string[]>([]);
	zone = $state<string | null>(null);
	index = $state(0);
	/** Height of the placeholder: all dragged rows stacked, as they will be after the drop. */
	gap = $state(0);
	width = $state(0);
	/** The first placement must not animate (it replaces the rows the drag just lifted). */
	fresh = $state(true);
	/** True for the one update that ends a drag: rows and placeholder swap with no transition. */
	settling = $state(false);
	/** Rows 2…n of the last drop, for the "unfold" entrance. */
	unfold = $state<string[]>([]);

	pos = new Spring({ x: 0, y: 0 }, { stiffness: 0.3, damping: 0.8 });
	lift = new Spring(0, { stiffness: 0.18, damping: 0.6 });

	#cfg: DragConfig;
	#grab = { x: 0, y: 0 };
	#pointer = { x: 0, y: 0 };
	#origin = { zone: '', index: 0 };
	#hitFrame = 0;
	#scrollFrame = 0;
	#root: HTMLElement | null = null;
	#ending = false;
	#startY = 0;
	/** Removes the window listeners of the current press. */
	#release = () => {};
	/** Where the pointer holds the card, so the lift scales around that point. */
	grab = $state({ x: 0, y: 0 });

	constructor(cfg: DragConfig) {
		this.#cfg = cfg;
	}

	get active() {
		return this.ids.length > 0;
	}

	/** Call from each row's `onpointerdown`. Mouse and pen only: touch must scroll the page. */
	pointerdown(e: PointerEvent, id: string, row: HTMLElement) {
		if (this.active || e.button !== 0 || e.pointerType === 'touch' || !this.#cfg.enabled()) return;
		if ((e.target as Element).closest('[data-no-drag]')) return;
		const start = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };

		const onMove = (ev: PointerEvent) => {
			if (ev.pointerId !== start.pointerId) return;
			if (this.active) return this.#move(ev.clientX, ev.clientY);
			if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > MOUSE_SLOP)
				this.#begin(id, row, start.x, start.y, ev.clientX, ev.clientY);
		};
		const onUp = (ev: PointerEvent) => {
			if (ev.pointerId !== start.pointerId) return;
			cleanup();
			if (!this.active) return;
			// The browser sends the click right after pointerup; block it now, not after the animation.
			suppressNextClick();
			this.#end(ev.type === 'pointercancel');
		};
		const cleanup = () => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			window.removeEventListener('pointercancel', onUp);
		};
		this.#release = cleanup;
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('pointercancel', onUp);
	}

	#begin(id: string, row: HTMLElement, sx: number, sy: number, x: number, y: number) {
		const zoneEl = row.closest<HTMLElement>('[data-drag-zone]');
		if (!zoneEl) return;
		this.#root = zoneEl.parentElement?.closest('[data-drag-root]') ?? document.body;
		const ids = this.#cfg.pick(id);
		const set = new Set(ids);
		const rows = [...zoneEl.querySelectorAll<HTMLElement>('[data-drag-id]')];
		const heights = ids
			.map((x) => this.#row(x)?.offsetHeight ?? row.offsetHeight)
			.reduce((sum, h) => sum + h, 0);
		const gapPx = parseFloat(getComputedStyle(row.parentElement!).rowGap) || 0;
		const rect = row.getBoundingClientRect();

		this.#startY = sy;
		this.#grab = { x: sx - rect.left, y: sy - rect.top };
		this.grab = this.#grab;
		this.#origin = {
			zone: zoneEl.dataset.dragZone!,
			index: rows.slice(0, rows.indexOf(row)).filter((r) => !set.has(r.dataset.dragId!)).length
		};
		this.width = rect.width;
		this.gap = heights + gapPx * (ids.length - 1);
		this.fresh = true;
		this.pos.set({ x: rect.left, y: rect.top }, { instant: true });
		this.lift.set(0, { instant: true });
		this.lift.target = 1;
		this.zone = this.#origin.zone;
		this.index = this.#origin.index;
		this.ids = ids;
		document.documentElement.classList.add('is-dragging');
		window.addEventListener('keydown', this.#onKey, true);
		this.#move(x, y);
		this.#scrollFrame = requestAnimationFrame(this.#autoscroll);
	}

	#row(id: string) {
		return (this.#root ?? document).querySelector<HTMLElement>(
			`[data-drag-id="${CSS.escape(id)}"]`
		);
	}

	#move(x: number, y: number) {
		this.#pointer = { x, y };
		this.pos.target = { x: x - this.#grab.x, y: y - this.#grab.y };
		cancelAnimationFrame(this.#hitFrame);
		this.#hitFrame = requestAnimationFrame(() => this.#hit());
	}

	/** Which zone and slot is under the pointer? Uses resting layout (offsetTop), not transforms. */
	#hit() {
		const { y } = this.#pointer;
		const zones = [...(this.#root ?? document).querySelectorAll<HTMLElement>('[data-drag-zone]')];
		let best: { el: HTMLElement; rect: DOMRect; d: number } | null = null;
		for (const el of zones) {
			const rect = el.getBoundingClientRect();
			const d = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
			if (!best || d < best.d) best = { el, rect, d };
		}
		if (!best || best.d > 56) return;
		const zone = best.el.dataset.dragZone!;
		let index = 0;
		if (!this.#cfg.isCollapsed(zone))
			for (const li of best.el.querySelectorAll<HTMLElement>('[data-drag-id]')) {
				// Resting position: the list's box plus offsetTop, which ignores flip transforms.
				const list = li.offsetParent as HTMLElement | null;
				const top = (list?.getBoundingClientRect().top ?? best.rect.top) + li.offsetTop;
				if (y > top + li.offsetHeight / 2) index++;
			}
		if (zone !== this.zone || index !== this.index) {
			this.fresh = false;
			this.zone = zone;
			this.index = index;
		}
	}

	#autoscroll = () => {
		if (!this.active) return;
		const { y } = this.#pointer;
		// A drag that starts near an edge must not scroll until the pointer really moves.
		if (Math.abs(y - this.#startY) < 24) {
			this.#scrollFrame = requestAnimationFrame(this.#autoscroll);
			return;
		}
		let v = 0;
		if (y < EDGE) v = -((EDGE - y) / EDGE) * MAX_SCROLL;
		else if (y > innerHeight - EDGE) v = ((y - (innerHeight - EDGE)) / EDGE) * MAX_SCROLL;
		if (v) {
			scrollBy(0, v);
			this.#hit();
		}
		this.#scrollFrame = requestAnimationFrame(this.#autoscroll);
	};

	#onKey = (e: KeyboardEvent) => {
		if (e.key !== 'Escape') return;
		e.preventDefault();
		e.stopPropagation();
		this.#end(true);
	};

	async #end(cancel: boolean) {
		if (!this.active || this.#ending) return;
		this.#ending = true;
		cancelAnimationFrame(this.#hitFrame);
		cancelAnimationFrame(this.#scrollFrame);
		window.removeEventListener('keydown', this.#onKey, true);
		// Esc ends the drag while the button is still down: stop listening to this press.
		this.#release();
		if (cancel) {
			this.zone = this.#origin.zone;
			this.index = this.#origin.index;
			await tick();
		}
		const ids = this.ids;
		const zone = this.zone!;
		const index = this.index;

		// Spring the card into its slot. Do not wait long for the last sub-pixel.
		const target =
			(this.#root ?? document).querySelector<HTMLElement>('[data-drag-placeholder]') ??
			(this.#root ?? document).querySelector<HTMLElement>(`[data-drag-zone="${zone}"]`);
		const r = target?.getBoundingClientRect();
		this.lift.target = 0;
		if (r) await Promise.race([this.pos.set({ x: r.left, y: r.top }), wait(320)]);

		const unchanged = cancel || (zone === this.#origin.zone && index === this.#origin.index);
		if (!unchanged) await this.#cfg.drop(ids, zone, index);

		// One update: the rows come back where the card is, with no transitions.
		this.settling = true;
		this.unfold = ids.slice(1);
		this.ids = [];
		this.zone = null;
		document.documentElement.classList.remove('is-dragging');
		await tick();
		this.#ending = false;
		setTimeout(() => {
			this.settling = false;
			this.unfold = [];
		}, 400);
	}
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The pointerup that ends a drag must not also click the row or its link. */
function suppressNextClick() {
	const stop = (e: Event) => {
		e.preventDefault();
		e.stopPropagation();
	};
	window.addEventListener('click', stop, { capture: true, once: true });
	setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 350);
}
