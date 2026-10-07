import { toast } from 'svelte-sonner';
import { api } from '$lib/api';
import { keys, queryClient } from '$lib/queries';
import { reportResolved } from '$lib/recheck';
import { GH_ACTIONS, type GhActionId } from '$lib/shared/actions';
import type { MergeMethod, PeekDTO } from '$lib/shared/types';

/**
 * Sending actions on GitHub, for the peek's bottom bar and its comment box (one copy of the
 * logic). After each action the server reads the item again; the lists and the peek refetch.
 */
export const acting = $state<{ id: GhActionId | null }>({ id: null });

export async function sendAction(
	p: PeekDTO,
	id: GhActionId,
	opts: { body?: string; method?: MergeMethod } = {}
): Promise<boolean> {
	acting.id = id;
	try {
		const res = await api.ghAction({
			repo: p.repo,
			number: p.number,
			action: id,
			body: opts.body,
			method: opts.method,
			sha: p.can.pr?.headOid,
			runs: p.can.pr?.failedRuns,
			id: p.can.id
		});
		reportResolved(res.resolved);
		for (const queryKey of [keys.peek(p.repo, p.number), keys.threadsAll, keys.dashAll])
			queryClient.invalidateQueries({ queryKey });
		return true;
	} catch (err) {
		toast.error(`${GH_ACTIONS[id].label}: ${(err as Error).message}`);
		return false;
	} finally {
		acting.id = null;
	}
}

/** Send it, then say so; actions that can be reversed get Undo in the toast. */
export async function sendWithUndo(
	p: PeekDTO,
	id: GhActionId,
	opts: { body?: string; method?: MergeMethod } = {}
): Promise<boolean> {
	if (!(await sendAction(p, id, opts))) return false;
	const undo = GH_ACTIONS[id].undo;
	toast.success(GH_ACTIONS[id].done, {
		description: `${p.repo}#${p.number}`,
		...(undo ? { action: { label: 'Undo', onClick: () => void sendWithUndo(p, undo, opts) } } : {})
	});
	return true;
}

/**
 * The comment box at the end of the conversation: what ⌘ Enter does there, and a counter the
 * box watches to take the focus (from the bar, a key, or the palette).
 */
export type ComposeIntent = 'comment' | 'approve' | 'request_changes';
export const composer = $state<{ intent: ComposeIntent; focus: number }>({
	intent: 'comment',
	focus: 0
});

export function focusComposer(intent: ComposeIntent) {
	composer.intent = intent;
	composer.focus++;
}
