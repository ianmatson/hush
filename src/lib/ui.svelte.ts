/** Small shared UI state. */
export const ui = $state({
	/** The bulk action bar is open at the bottom; toasts must sit above it. */
	bulkBarOpen: false,
	/** The peek panel is docked on the right (wide screens): the page makes room for it. */
	peekDocked: false,
	/** The alert history panel (the bell) is open. It and the peek share the right side. */
	alertsOpen: false
});
