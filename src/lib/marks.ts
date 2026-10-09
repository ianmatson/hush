import type { MarkColor, Settings } from '$lib/shared/types';

export interface RowMark {
	key: string;
	name: string;
	group: string;
	color: MarkColor;
	icon?: string;
}

export const MARK_DOT: Record<MarkColor, string> = {
	gray: 'bg-mark-gray',
	red: 'bg-mark-red',
	orange: 'bg-mark-orange',
	amber: 'bg-mark-amber',
	green: 'bg-mark-green',
	teal: 'bg-mark-teal',
	blue: 'bg-mark-blue',
	violet: 'bg-mark-violet',
	pink: 'bg-mark-pink'
};

export const MARK_TEXT: Record<MarkColor, string> = {
	gray: 'text-mark-gray',
	red: 'text-mark-red',
	orange: 'text-mark-orange',
	amber: 'text-mark-amber',
	green: 'text-mark-green',
	teal: 'text-mark-teal',
	blue: 'text-mark-blue',
	violet: 'text-mark-violet',
	pink: 'text-mark-pink'
};

export function rowMarks(
	categoryIds: string[] | undefined,
	settings: Pick<Settings, 'categoryGroups'> | undefined
): RowMark[] {
	return (settings?.categoryGroups ?? []).flatMap((g) =>
		g.categories
			.filter((c) => categoryIds?.includes(c.id))
			.map((c) => ({ key: c.id, name: c.name, group: g.name, color: c.color, icon: c.icon }))
	);
}
