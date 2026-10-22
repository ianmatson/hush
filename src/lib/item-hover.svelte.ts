import type { Attachment } from 'svelte/attachments';
import { on } from 'svelte/events';
import type { RowMark } from '$lib/marks';
import { peek } from '$lib/peek.svelte';
import type { DashItem } from '$lib/shared/types';

export const HOVER_OPEN_DELAY_MS = 500;
export const HOVER_CLOSE_DELAY_MS = 120;

const PARTS_WITH_THEIR_OWN_HOVER = 'button, [data-slot="tooltip-trigger"]';

export interface HoveredItem {
	item: DashItem;
	marks: RowMark[];
}

export interface HoverAnchor {
	getBoundingClientRect(): DOMRect;
}

interface Shown {
	zone: HTMLElement;
	entry: HoveredItem;
	anchor: HoverAnchor;
}

function anchorBelowPointer(zone: HTMLElement, pointerX: number): HoverAnchor {
	return {
		getBoundingClientRect() {
			const r = zone.getBoundingClientRect();
			return new DOMRect(pointerX, r.top, 0, r.height);
		}
	};
}

class ItemHover {
	shown = $state.raw<Shown | null>(null);
	#pending: { zone: HTMLElement; entry: HoveredItem; pointerX: number } | null = null;
	#openTimer: ReturnType<typeof setTimeout> | undefined;
	#closeTimer: ReturnType<typeof setTimeout> | undefined;

	intend(zone: HTMLElement, entry: HoveredItem, pointerX: number) {
		clearTimeout(this.#closeTimer);
		if (this.shown?.zone === zone) return;
		if (this.shown) {
			this.#show(zone, entry, pointerX);
			return;
		}
		if (this.#pending?.zone === zone) return;
		clearTimeout(this.#openTimer);
		this.#pending = { zone, entry, pointerX };
		this.#openTimer = setTimeout(() => {
			const pending = this.#pending;
			if (pending) this.#show(pending.zone, pending.entry, pending.pointerX);
		}, HOVER_OPEN_DELAY_MS);
	}

	follow(zone: HTMLElement, pointerX: number) {
		if (this.#pending?.zone === zone) this.#pending.pointerX = pointerX;
	}

	leave(zone: HTMLElement) {
		if (this.#pending?.zone === zone) {
			clearTimeout(this.#openTimer);
			this.#pending = null;
		}
		if (this.shown?.zone === zone) {
			clearTimeout(this.#closeTimer);
			this.#closeTimer = setTimeout(() => this.close(), HOVER_CLOSE_DELAY_MS);
		}
	}

	forget(zone: HTMLElement) {
		if (this.shown?.zone === zone || this.#pending?.zone === zone) this.close();
	}

	close() {
		clearTimeout(this.#openTimer);
		clearTimeout(this.#closeTimer);
		this.#pending = null;
		this.shown = null;
	}

	#show(zone: HTMLElement, entry: HoveredItem, pointerX: number) {
		clearTimeout(this.#openTimer);
		this.#pending = null;
		this.shown = { zone, entry, anchor: anchorBelowPointer(zone, pointerX) };
	}
}

export const itemHover = new ItemHover();

function onPartWithItsOwnHover(zone: HTMLElement, target: EventTarget | null): boolean {
	const part = target instanceof Element ? target.closest(PARTS_WITH_THEIR_OWN_HOVER) : null;
	return !!part && part !== zone && zone.contains(part);
}

const isInThePeek = (item: DashItem) => peek.target?.id === item.id;

export function itemHoverZone(hovered: () => HoveredItem): Attachment<HTMLElement> {
	return (zone) => {
		const enter = (e: PointerEvent) => {
			const entry = hovered();
			const showsCard =
				e.pointerType === 'mouse' &&
				!isInThePeek(entry.item) &&
				!onPartWithItsOwnHover(zone, e.target);
			if (showsCard) itemHover.intend(zone, entry, e.clientX);
			else itemHover.leave(zone);
		};
		const stopListening = [
			on(zone, 'pointerover', enter),
			on(zone, 'pointermove', (e) => itemHover.follow(zone, e.clientX)),
			on(zone, 'pointerleave', () => itemHover.leave(zone)),
			on(zone, 'pointerdown', () => itemHover.close())
		];
		return () => {
			for (const stop of stopListening) stop();
			itemHover.forget(zone);
		};
	};
}
