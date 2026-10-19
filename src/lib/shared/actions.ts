import type { ActionKind, MergeMethod, PeekDTO } from './types';

/**
 * Actions on GitHub from Hush (the peek, its keys, and the command palette). One table: the
 * label, its keyboard command (keys: shared/keymap.ts), and how each action is made safe.
 */
export type GhActionId =
	| 'approve'
	| 'request_changes'
	| 'comment'
	| 'rerun'
	| 'merge'
	| 'auto_merge'
	| 'auto_merge_off'
	| 'ready'
	| 'draft'
	| 'close'
	| 'reopen';

export interface GhActionInfo {
	label: string;
	pending: string;
	/** The toast when it worked. */
	done: string;
	/** Its keyboard shortcut: a command in shared/keymap.ts (keys are set there). */
	command?: string;
	/** Needs text: the comment box opens (optional for approve). */
	body?: 'required' | 'optional';
	confirm?: boolean;
	/** The action that takes it back from the toast. */
	undo?: GhActionId;
	endsItem?: boolean;
}

export const GH_ACTIONS: Record<GhActionId, GhActionInfo> = {
	approve: {
		label: 'Approve',
		pending: 'Approving…',
		done: 'Approved',
		command: 'peek.approve',
		body: 'optional'
	},
	request_changes: {
		label: 'Request changes',
		pending: 'Requesting changes…',
		done: 'Changes requested',
		command: 'peek.requestChanges',
		body: 'required'
	},
	comment: {
		label: 'Comment',
		pending: 'Posting comment…',
		done: 'Comment posted',
		command: 'peek.comment',
		body: 'required'
	},
	rerun: {
		label: 'Re-run failed jobs',
		pending: 'Re-running failed jobs…',
		done: 'Failed jobs are running again',
		command: 'peek.rerun'
	},
	merge: {
		label: 'Merge',
		pending: 'Merging…',
		done: 'Merged',
		command: 'peek.merge',
		confirm: true,
		endsItem: true
	},
	auto_merge: {
		label: 'Enable auto-merge',
		pending: 'Turning on auto-merge…',
		done: 'Auto-merge is on',
		undo: 'auto_merge_off'
	},
	auto_merge_off: {
		label: 'Turn off auto-merge',
		pending: 'Turning off auto-merge…',
		done: 'Auto-merge is off',
		undo: 'auto_merge'
	},
	ready: {
		label: 'Ready for review',
		pending: 'Marking ready for review…',
		done: 'Ready for review',
		command: 'peek.draftReady',
		undo: 'draft'
	},
	draft: {
		label: 'Convert to draft',
		pending: 'Converting to draft…',
		done: 'Converted to draft',
		command: 'peek.draftReady',
		undo: 'ready'
	},
	close: {
		label: 'Close',
		pending: 'Closing…',
		done: 'Closed',
		command: 'peek.closeReopen',
		undo: 'reopen',
		endsItem: true
	},
	reopen: {
		label: 'Reopen',
		pending: 'Reopening…',
		done: 'Reopened',
		command: 'peek.closeReopen',
		undo: 'close'
	}
};

export const MERGE_LABEL: Record<MergeMethod, string> = {
	SQUASH: 'Squash and merge',
	MERGE: 'Merge commit',
	REBASE: 'Rebase and merge'
};

/** One action on this PR or issue: shown, and maybe blocked (with the reason). */
export interface GhActionState {
	id: GhActionId;
	blocked?: string;
}

export const MAX_COMMENT_LENGTH = 65_536;

const WRITE_PERMISSIONS = new Set(['ADMIN', 'MAINTAIN', 'WRITE']);

export const hasWritePermission = (permission: string | null | undefined): boolean =>
	!!permission && WRITE_PERMISSIONS.has(permission);

/** Why GitHub would refuse a merge now, or null when it can merge. */
function mergeBlocker(p: PeekDTO): string | null {
	const pr = p.can.pr!;
	if (!hasWritePermission(p.can.permission)) return 'You cannot merge in this repository.';
	if (p.draft) return 'It is a draft.';
	if (!pr.methods.length) return 'The repository allows no merge method.';
	switch (pr.mergeState) {
		case 'CLEAN':
		case 'HAS_HOOKS':
		case 'UNSTABLE':
			return null;
		case 'DIRTY':
			return 'It has merge conflicts.';
		case 'BEHIND':
			return pr.mergeAsAdmin ? null : 'The branch is behind its base.';
		case 'BLOCKED':
			return pr.mergeAsAdmin ? null : 'Required reviews or checks are missing.';
		case 'DRAFT':
			return 'It is a draft.';
		default:
			return 'GitHub is still checking if it can merge. Try again in a moment.';
	}
}

/** The actions that apply to this PR or issue now, in button order. */
export function ghActions(p: PeekDTO): GhActionState[] {
	const out: GhActionState[] = [];
	const open = p.state === 'open';
	if (p.kind === 'pr' && p.can.pr && open) {
		const pr = p.can.pr;
		const own = p.can.author ? 'GitHub does not let you review your own pull request.' : undefined;
		out.push({ id: 'approve', blocked: own }, { id: 'request_changes', blocked: own });
		if (pr.failedRuns.length) out.push({ id: 'rerun' });
		out.push({ id: 'merge', blocked: mergeBlocker(p) ?? undefined });
		if (pr.autoMerge.on) {
			if (pr.autoMerge.canDisable) out.push({ id: 'auto_merge_off' });
		} else if (pr.autoMerge.canEnable) out.push({ id: 'auto_merge' });
		if (p.can.update) out.push({ id: p.draft ? 'ready' : 'draft' });
	}
	if (p.can.comment) out.push({ id: 'comment' });
	if (open && p.can.close) out.push({ id: 'close' });
	if (!open && p.state !== 'merged' && p.can.reopen) out.push({ id: 'reopen' });
	return out;
}

/** The action that fits what the thread asks of you (the main button), if it applies. */
export function mainAction(kind: ActionKind | null, states: GhActionState[]): GhActionState | null {
	const pick: Partial<Record<ActionKind, GhActionId>> = {
		review: 'approve',
		fix_ci: 'rerun',
		merge: 'merge',
		reply: 'comment'
	};
	const want = kind ? pick[kind] : undefined;
	return (
		states.find((s) => s.id === want && !s.blocked) ??
		states.find((s) => s.id === 'ready') ??
		states.find((s) => s.id === 'comment') ??
		null
	);
}
