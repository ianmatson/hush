import type { Component } from 'svelte';
import type { SnoozeEvent } from '$lib/shared/snooze';
import type { MarkColor } from '$lib/shared/types';
import { SEP, tidySeparators } from '$lib/shared/menus';

/** One entry of a built menu (see AppMenu). Pages build these from Settings → Menus. */
export type MenuEntry =
	| {
			type: 'item';
			key: string;
			label: string;
			icon?: Component;
			shortcut?: string;
			disabled?: boolean;
			checked?: boolean;
			mark?: { kind: 'category' | 'tag'; color: MarkColor; icon?: string };
			run: () => void;
	  }
	| { type: 'sep'; key: string }
	| { type: 'sub'; key: string; label: string; icon?: Component; items: MenuEntry[] }
	| {
			type: 'snooze';
			key: string;
			label: string;
			icon?: Component;
			subjects: ('pr' | 'issue' | 'other')[];
			disabled: SnoozeEvent[];
			onpick: (body: { until?: number; event?: SnoozeEvent }) => void;
			/** Phones: a sheet instead of nested submenus. */
			sheet: () => void;
	  };

/**
 * Build a menu from saved ids. `make` returns the entry for an id, or null when it does not apply
 * here (then it is left out). Separators are tidied after that.
 */
export function buildMenu(ids: string[], make: (id: string) => MenuEntry | null): MenuEntry[] {
	const entries = ids.map((id, k) =>
		id === SEP ? ({ type: 'sep', key: `sep-${k}` } as MenuEntry) : make(id)
	);
	return tidySeparators(
		entries.filter((e): e is MenuEntry => !!e),
		(e) => e.type === 'sep'
	);
}
