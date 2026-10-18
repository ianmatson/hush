import { itemCategoriesIn } from '$lib/shared/categories';
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
	return itemCategoriesIn(settings?.categoryGroups ?? [], categoryIds).map(
		({ group, category }) => ({
			key: category.id,
			name: category.name,
			group: group.name,
			color: category.color,
			icon: category.icon
		})
	);
}
