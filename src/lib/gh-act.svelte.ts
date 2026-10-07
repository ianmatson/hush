import { toast } from 'svelte-sonner';
import { api } from '$lib/api';
import { keys, queryClient, refetchUnlessLive } from '$lib/queries';
import { holdPeekOn, releasePeekHold } from '$lib/peek.svelte';
import { reportResolved } from '$lib/recheck';
import { GH_ACTIONS, type GhActionId } from '$lib/shared/actions';
import type { MergeMethod, PeekDTO, PeekEntry } from '$lib/shared/types';

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
	if (GH_ACTIONS[id].endsItem) releasePeekHold();
	else holdPeekOn(p.repo, p.number);
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
		if (res.entry) appendToPeekTimeline(p.repo, p.number, res.entry);
		const entryIsTheOnlyPeekChange = id === 'comment' && res.entry !== null;
		if (!entryIsTheOnlyPeekChange)
			queryClient.invalidateQueries({ queryKey: keys.peek(p.repo, p.number) });
		refetchUnlessLive(keys.threadsAll, keys.dashAll);
		return true;
	} catch (err) {
		toast.error(`${GH_ACTIONS[id].label}: ${(err as Error).message}`);
		return false;
	} finally {
		acting.id = null;
	}
}

function appendToPeekTimeline(repo: string, number: number, entry: PeekEntry) {
	queryClient.setQueryData<PeekDTO>(keys.peek(repo, number), (old) => {
		if (!old || old.timeline.items.some((e) => e.url === entry.url)) return old;
		return {
			...old,
			timeline: { total: old.timeline.total + 1, items: [...old.timeline.items, entry] }
		};
	});
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
