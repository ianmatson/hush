export type RowLayout = 'cards' | 'table';

export const ROW_LAYOUTS: { id: RowLayout; label: string; description: string }[] = [
	{ id: 'cards', label: 'Cards', description: 'Two or three lines for each item, with badges.' },
	{ id: 'table', label: 'Table', description: 'One line for each item, in columns.' }
];

export const DEFAULT_ROW_LAYOUT: RowLayout = 'cards';

export type TableColumn =
	| 'reason'
	| 'repo'
	| 'author'
	| 'categories'
	| 'categoryNames'
	| 'ci'
	| 'size'
	| 'comments'
	| 'time';

export interface TableColumnInfo {
	id: TableColumn;
	label: string;
	widthRem: number;
	dropOrder: number;
	prOnly?: boolean;
}

export const TABLE_COLUMNS: TableColumnInfo[] = [
	{ id: 'reason', label: 'Turn', widthRem: 9, dropOrder: 8 },
	{ id: 'repo', label: 'Repository and number', widthRem: 7.5, dropOrder: 3 },
	{ id: 'author', label: 'Author', widthRem: 7, dropOrder: 1 },
	{ id: 'categories', label: 'Category icons', widthRem: 3.5, dropOrder: 6 },
	{ id: 'categoryNames', label: 'Category names', widthRem: 10, dropOrder: 2 },
	{ id: 'ci', label: 'CI status', widthRem: 1, dropOrder: 7, prOnly: true },
	{ id: 'size', label: 'Size (+/− lines)', widthRem: 5, dropOrder: 4, prOnly: true },
	{ id: 'comments', label: 'Comment count', widthRem: 2.25, dropOrder: 5 },
	{ id: 'time', label: 'Updated or waiting time', widthRem: 2.5, dropOrder: 9 }
];

export const TABLE_AVATAR_REM = 1.25;
export const TABLE_GAP_REM = 0.5;
export const TABLE_PADDING_REM = 1;
export const TABLE_MIN_TITLE_REM = 10;

export const tableRowMinRem = (columns: TableColumnInfo[]) =>
	TABLE_PADDING_REM +
	TABLE_AVATAR_REM +
	TABLE_MIN_TITLE_REM +
	columns.reduce((sum, c) => sum + c.widthRem, 0) +
	TABLE_GAP_REM * (columns.length + 1);

export function fitTableColumns(
	columns: TableColumnInfo[],
	availableRem: number
): TableColumnInfo[] {
	const byKeepRank = [...columns].sort((a, b) => a.dropOrder - b.dropOrder);
	const dropped = new Set<TableColumn>();
	while (
		dropped.size < byKeepRank.length &&
		tableRowMinRem(columns.filter((c) => !dropped.has(c.id))) > availableRem
	)
		dropped.add(byKeepRank[dropped.size].id);
	return columns.filter((c) => !dropped.has(c.id));
}

export const DEFAULT_TABLE_COLUMNS: TableColumn[] = [
	'reason',
	'categories',
	'size',
	'comments',
	'time'
];

const isTableColumn = (id: unknown): id is TableColumn => TABLE_COLUMNS.some((c) => c.id === id);

export const knownRowLayout = (layout: unknown): RowLayout =>
	ROW_LAYOUTS.some((l) => l.id === layout) ? (layout as RowLayout) : DEFAULT_ROW_LAYOUT;

export const knownTableColumns = (columns: unknown): TableColumn[] =>
	Array.isArray(columns)
		? TABLE_COLUMNS.map((c) => c.id).filter((id) => columns.includes(id))
		: DEFAULT_TABLE_COLUMNS;

export const shownTableColumns = (columns: TableColumn[]): TableColumnInfo[] => {
	const namesReplaceIcons = columns.includes('categoryNames');
	return TABLE_COLUMNS.filter(
		(c) => columns.includes(c.id) && !(c.id === 'categories' && namesReplaceIcons)
	);
};

export function validateRowLayout(v: unknown): string | null {
	return ROW_LAYOUTS.some((l) => l.id === v)
		? null
		: `"rowLayout" must be ${ROW_LAYOUTS.map((l) => `"${l.id}"`).join(' or ')}.`;
}

export function validateTableColumns(v: unknown): string | null {
	if (!Array.isArray(v)) return '"tableColumns" must be a list of the columns to show.';
	const unknown = v.find((id) => !isTableColumn(id));
	if (unknown !== undefined)
		return `"tableColumns": unknown column "${unknown}". Columns: ${TABLE_COLUMNS.map((c) => c.id).join(', ')}.`;
	if (new Set(v).size !== v.length) return '"tableColumns" lists a column twice.';
	return null;
}
