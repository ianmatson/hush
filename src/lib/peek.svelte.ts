import type { Snippet } from 'svelte';
import type { PeekTarget } from '$lib/components/app/peek.svelte';

/**
 * The peek is one panel for the list pages (each renders PeekHost), so it stays open when you
 * change between them. The page that opened it "owns" it (for example "inbox:action" or "pulls"):
 * only the owner moves it with its cursor and adds its actions (Done, Snooze…). Another page
 * takes it over when you peek something there (a click, Space, J/K while it is open).
 */
export const peek = $state<{
	owner: string | null;
	/** The item on show; `id` lets its page put the cursor back on it. */
	target: (PeekTarget & { id: string }) | null;
	/** Why the item is in its list (the owner's "why" line). */
	header: Snippet | null;
	footer: Snippet | null;
	heldId: string | null;
}>({ owner: null, target: null, header: null, footer: null, heldId: null });

export const peekIsOpen = () => peek.owner !== null;

export function claimPeek(owner: string) {
	if (peek.owner !== owner) peek.heldId = null;
	peek.owner = owner;
}

export function closePeek() {
	peek.owner = null;
	peek.target = null;
	peek.header = null;
	peek.footer = null;
	peek.heldId = null;
}

export function holdPeekOn(repo: string, number: number) {
	const target = peek.target;
	if (target && target.repo === repo && target.number === number) peek.heldId = target.id;
}

export function releasePeekHoldUnlessOn(id: string | null) {
	if (peek.heldId !== null && peek.heldId !== id) peek.heldId = null;
}
