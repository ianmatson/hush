/**
 * Menus that live on list rows (the "⋯" and Snooze dropdowns). A click on a row closes all of
 * them: the menu library does not always see that click as "outside" (the rows sit inside the
 * list's right-click trigger), so the pages call `closeRowMenus()` from their row click.
 */
export const rowMenus = $state({ epoch: 0 });
export const closeRowMenus = () => rowMenus.epoch++;
