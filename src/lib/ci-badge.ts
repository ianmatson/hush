import type { Component } from 'svelte';
import CircleCheck from '@lucide/svelte/icons/circle-check';
import CircleDashed from '@lucide/svelte/icons/circle-dashed';
import CircleX from '@lucide/svelte/icons/circle-x';
import type { CiState } from '$lib/shared/types';

export interface CiBadge {
	icon: Component;
	tone: string;
	label: string;
}

const PASSING: CiBadge = { icon: CircleCheck, tone: 'text-signal-merge', label: 'Checks pass' };
const FAILING: CiBadge = { icon: CircleX, tone: 'text-signal-fail', label: 'Checks fail' };
const RUNNING: CiBadge = { icon: CircleDashed, tone: 'text-signal-warn', label: 'Checks running' };

const BADGE_OF_STATE: Record<CiState, CiBadge> = {
	SUCCESS: PASSING,
	FAILURE: FAILING,
	ERROR: FAILING,
	PENDING: RUNNING,
	EXPECTED: RUNNING
};

export const ciBadge = (ci: CiState | null): CiBadge | null => (ci ? BADGE_OF_STATE[ci] : null);
