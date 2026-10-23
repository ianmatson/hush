/**
 * Menus that live on list rows (the "⋯" and Snooze dropdowns). A click on a row closes all of
 * them: the menu library does not always see that click as "outside" (the rows sit inside the
 * list's right-click trigger), so the pages call `closeRowMenus()` from their row click.
 */
export const rowMenus = $state<{ epoch: number; open: symbol | null }>({ epoch: 0, open: null });

export function closeRowMenus() {
	rowMenus.epoch++;
	rowMenus.open = null;
}

export function rowMenu() {
	const owner = Symbol('row menu');
	return {
		get open() {
			return rowMenus.open === owner;
		},
		set open(open: boolean) {
			if (open) rowMenus.open = owner;
			else if (rowMenus.open === owner) rowMenus.open = null;
		}
	};
}
