import type { MarkColor } from '$lib/shared/types';

export interface RowMark {
	key: string;
	name: string;
	color: MarkColor;
	kind: 'category' | 'tag';
	icon?: string;
}

export const MARK_DOT: Record<MarkColor, string> = {
	gray: 'bg-zinc-400',
	red: 'bg-red-500',
	orange: 'bg-orange-500',
	amber: 'bg-amber-500',
	green: 'bg-emerald-500',
	teal: 'bg-teal-500',
	blue: 'bg-blue-500',
	violet: 'bg-violet-500',
	pink: 'bg-pink-500'
};

export const MARK_TEXT: Record<MarkColor, string> = {
	gray: 'text-zinc-500',
	red: 'text-red-500',
	orange: 'text-orange-500',
	amber: 'text-amber-500',
	green: 'text-emerald-500',
	teal: 'text-teal-500',
	blue: 'text-blue-500',
	violet: 'text-violet-500',
	pink: 'text-pink-500'
};
