import { FALLBACK_CATEGORY_ID } from '$lib/shared/categories';
import type { MarkColor, Settings } from '$lib/shared/types';

export interface RowMark {
	key: string;
	name: string;
	color: MarkColor;
	kind: 'category' | 'tag';
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
	categoryId: string | null | undefined,
	tagIds: string[] | undefined,
	settings: Pick<Settings, 'categories' | 'tags'> | undefined
): RowMark[] {
	const category = settings?.categories.find(
		(c) => c.id === categoryId && c.id !== FALLBACK_CATEGORY_ID
	);
	return [
		...(category
			? [
					{
						key: `c:${category.id}`,
						name: category.name,
						color: category.color,
						kind: 'category' as const,
						icon: category.icon
					}
				]
			: []),
		...(settings?.tags ?? [])
			.filter((t) => tagIds?.includes(t.id))
			.map((t) => ({ key: `t:${t.id}`, name: t.name, color: t.color, kind: 'tag' as const }))
	];
}
