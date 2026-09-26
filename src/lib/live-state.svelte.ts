/** Whether the live socket is open (see live.svelte.ts). The query timers read it. */
export const live = $state({ connected: false });
