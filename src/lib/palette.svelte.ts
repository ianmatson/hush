import { untrack, type Component } from 'svelte';

export interface PaletteCommand {
	/** Stable id, used for "Recent". */
	id: string;
	label: string;
	/** Shown after the label, muted (e.g. the thread an action applies to). */
	detail?: string;
	icon?: Component;
	shortcut?: string;
	keywords?: string[];
	run: () => void;
}

/** Where a palette item lives, so its list can open it in the peek after navigation. */
export type PeekRequest = { key: string; list: string };

const RECENT_KEY = 'hush:palette-recent';
const RECENT_MAX = 6;

class Palette {
	open = $state(false);
	/** Set by the palette; the page that shows the item opens it in the peek and clears this. */
	peekRequest = $state<PeekRequest | null>(null);
	/** Actions from the current page (on the cursor row or the selection). */
	#sources = $state.raw<(() => PaletteCommand[])[]>([]);
	recent = $state<string[]>([]);

	constructor() {
		if (typeof localStorage !== 'undefined')
			try {
				this.recent = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
			} catch {
				this.recent = [];
			}
	}

	/** Call in an $effect: `$effect(() => palette.register(() => [...]))`. Returns the cleanup. */
	register(source: () => PaletteCommand[]) {
		// Untracked: the caller's $effect must not depend on the list it changes.
		untrack(() => (this.#sources = [...this.#sources, source]));
		return () => untrack(() => (this.#sources = this.#sources.filter((s) => s !== source)));
	}

	/** Read inside a reactive context: sources read page state when called. */
	get pageCommands(): PaletteCommand[] {
		return this.#sources.flatMap((s) => s());
	}

	remember(id: string) {
		this.recent = [id, ...this.recent.filter((r) => r !== id)].slice(0, RECENT_MAX);
		localStorage.setItem(RECENT_KEY, JSON.stringify(this.recent));
	}
}

export const palette = new Palette();
