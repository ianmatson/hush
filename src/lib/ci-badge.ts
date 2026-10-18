import type { Component } from 'svelte';
import CircleCheck from '@lucide/svelte/icons/circle-check';
import CircleDashed from '@lucide/svelte/icons/circle-dashed';
import CircleX from '@lucide/svelte/icons/circle-x';
import { ciWord } from '$lib/shared/ci';
import type { CiState, CiWord } from '$lib/shared/types';

export interface CiBadge {
	icon: Component;
	tone: string;
	label: string;
}

const BADGE_OF_WORD: Record<CiWord, CiBadge> = {
	success: { icon: CircleCheck, tone: 'text-signal-merge', label: 'Checks pass' },
	failure: { icon: CircleX, tone: 'text-signal-fail', label: 'Checks fail' },
	pending: { icon: CircleDashed, tone: 'text-signal-warn', label: 'Checks running' }
};

export function ciBadge(ci: CiState | null | undefined): CiBadge | null {
	const word = ciWord(ci);
	return word ? BADGE_OF_WORD[word] : null;
}
