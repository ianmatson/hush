import type { Snippet } from 'svelte';
import type { PeekTarget } from '$lib/components/app/peek.svelte';

/**
 * The peek is one panel for the whole app (rendered by the app shell), so it stays open when
 * you change tabs. The page that opened it "owns" it (for example "inbox:action" or "pulls"):
 * only the owner moves it with its cursor and adds its actions (Done, Snooze…). Another page
 * takes it over when you peek something there (a click, Space, J/K while it is open).
 */
export const peek = $state<{
	owner: string | null;
	/** The item on show; `id` lets its page put the cursor back on it. */
	target: (PeekTarget & { id: string }) | null;
	footer: Snippet | null;
}>({ owner: null, target: null, footer: null });

export const peekIsOpen = () => peek.owner !== null;

export function claimPeek(owner: string) {
	peek.owner = owner;
}

export function closePeek() {
	peek.owner = null;
	peek.target = null;
	peek.footer = null;
}
