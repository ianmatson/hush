import type { Component } from 'svelte';
import CircleCheck from '@lucide/svelte/icons/circle-check';
import CircleDot from '@lucide/svelte/icons/circle-dot';
import GitMerge from '@lucide/svelte/icons/git-merge';
import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
import GitPullRequestClosed from '@lucide/svelte/icons/git-pull-request-closed';
import GitPullRequestDraft from '@lucide/svelte/icons/git-pull-request-draft';
import type { DashKind } from '$lib/shared/types';

export type ShownState = 'open' | 'draft' | 'merged' | 'closed';

export const STATE: Record<ShownState, { label: string; tone: string }> = {
	open: { label: 'Open', tone: 'bg-signal-merge/12 text-signal-merge' },
	draft: { label: 'Draft', tone: 'bg-muted text-muted-foreground' },
	merged: { label: 'Merged', tone: 'bg-signal-reply/12 text-signal-reply' },
	closed: { label: 'Closed', tone: 'bg-signal-fail/12 text-signal-fail' }
};

interface StateFacts {
	kind: DashKind;
	state: 'open' | 'closed' | 'merged';
	draft: boolean;
}

export const shownStateOf = (i: StateFacts): ShownState =>
	i.state === 'open' && i.draft ? 'draft' : i.state;

export function stateIcon(i: StateFacts): Component {
	const s = shownStateOf(i);
	if (i.kind === 'issue') return s === 'closed' ? CircleCheck : CircleDot;
	return s === 'merged'
		? GitMerge
		: s === 'closed'
			? GitPullRequestClosed
			: s === 'draft'
				? GitPullRequestDraft
				: GitPullRequest;
}

const LIGHT_LABEL_LUMA = 0.6;

export function labelInk(hex: string): string {
	const n = parseInt(hex, 16);
	const luma = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
	return luma > LIGHT_LABEL_LUMA ? '#1a1a1a' : '#fff';
}
