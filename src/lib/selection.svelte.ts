import { SvelteSet } from 'svelte/reactivity';

/**
 * Multi-select for a list: Cmd/Ctrl-click toggles, Shift-click selects a range from the anchor.
 * The keyboard cursor is separate; actions use the selection when it is not empty.
 */
export class Selection {
	ids = new SvelteSet<string>();
	anchor: string | null = null;

	get size() {
		return this.ids.size;
	}

	has(id: string) {
		return this.ids.has(id);
	}

	clear() {
		this.ids.clear();
		this.anchor = null;
	}

	toggle(id: string) {
		if (this.ids.has(id)) this.ids.delete(id);
		else this.ids.add(id);
		this.anchor = id;
	}

	/**
	 * Select everything between the anchor and `to`, in list order. With no anchor, the range
	 * starts at `cursor` (the row the keyboard or the last plain click is on).
	 */
	range(order: string[], to: string, cursor?: string | null) {
		const start = this.anchor ?? cursor ?? null;
		const from = start && order.includes(start) ? start : to;
		const [a, b] = [order.indexOf(from), order.indexOf(to)].sort((x, y) => x - y);
		for (const id of order.slice(a, b + 1)) this.ids.add(id);
		this.anchor ??= to;
	}

	all(order: string[]) {
		for (const id of order) this.ids.add(id);
	}

	/** Handle a row click. Returns true when the click changed the selection. */
	click(
		e: MouseEvent | KeyboardEvent,
		id: string,
		order: string[],
		cursor?: string | null
	): boolean {
		if (e.shiftKey) {
			this.range(order, id, cursor);
			return true;
		}
		if (e.metaKey || e.ctrlKey) {
			this.toggle(id);
			return true;
		}
		return false;
	}

	/** Forget ids that are no longer in the list. */
	prune(order: string[]) {
		const keep = new Set(order);
		for (const id of this.ids) if (!keep.has(id)) this.ids.delete(id);
	}

	/** The rows an action applies to: the selection, or else the one row. */
	targets(order: string[], fallback: string | null | undefined): string[] {
		if (this.ids.size) return order.filter((id) => this.ids.has(id));
		return fallback ? [fallback] : [];
	}
}
