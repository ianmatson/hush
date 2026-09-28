/**
 * Whether the live socket is open (see live.svelte.ts; the query timers read it), and whether
 * the server is syncing with GitHub right now ("Syncing…").
 */
export const live = $state({ connected: false, syncing: false });
