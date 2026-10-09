export type RowKind = 'pr' | 'issue' | 'thread';

export interface RowPart {
	id: string;
	label: string;
}

export type RowSettings = Record<RowKind, string[]>;

const ITEM_PARTS: RowPart[] = [
	{ id: 'time', label: 'Updated or waiting time' },
	{ id: 'author', label: 'Author' },
	{ id: 'external', label: 'External contributor' },
	{ id: 'comments', label: 'Comment count' },
	{ id: 'moved', label: 'Moved by you' },
	{ id: 'changes', label: 'Changes since you looked' },
	{ id: 'categories', label: 'Categories' },
	{ id: 'categoryNames', label: 'Category names' },
	{ id: 'labels', label: 'GitHub labels' },
	{ id: 'sources', label: 'Sources' }
];

const PR_ONLY_PARTS: RowPart[] = [
	{ id: 'size', label: 'Size (+/− lines)' },
	{ id: 'stack', label: 'Stack position' },
	{ id: 'ci', label: 'CI status' },
	{ id: 'review', label: 'Review state' },
	{ id: 'threads', label: 'Open review threads' },
	{ id: 'conflicts', label: 'Conflicts' },
	{ id: 'draft', label: 'Draft' }
];

export const ROW_PARTS: Record<RowKind, RowPart[]> = {
	pr: [...ITEM_PARTS.slice(0, 4), ...PR_ONLY_PARTS, ...ITEM_PARTS.slice(4)],
	issue: ITEM_PARTS,
	thread: [
		{ id: 'time', label: 'Updated time' },
		{ id: 'why', label: 'Why you got it' },
		{ id: 'changes', label: 'Changes since you looked' },
		{ id: 'override', label: '“Doesn’t need me” note' },
		{ id: 'categories', label: 'Categories' },
		{ id: 'categoryNames', label: 'Category names' },
		{ id: 'resolved', label: 'Why Hush moved it' },
		{ id: 'draft', label: 'Draft' },
		{ id: 'snooze', label: 'Snoozed until' }
	]
};

export const ROW_KINDS: { id: RowKind; label: string }[] = [
	{ id: 'pr', label: 'Pull requests' },
	{ id: 'issue', label: 'Issues' },
	{ id: 'thread', label: 'Notifications' }
];

export const MAX_ROW_LABELS = 2;

export const DEFAULT_ROWS: RowSettings = {
	pr: ['threads', 'categoryNames', 'labels', 'sources'],
	issue: ['categoryNames', 'labels', 'sources'],
	thread: ['why', 'changes', 'categoryNames']
};

export const knownRowParts = (rows: Partial<RowSettings>): RowSettings =>
	Object.fromEntries(
		ROW_KINDS.map(({ id }) => [
			id,
			(rows[id] ?? DEFAULT_ROWS[id]).filter((part) => ROW_PARTS[id].some((p) => p.id === part))
		])
	) as RowSettings;

export const rowShows = (rows: RowSettings | undefined, kind: RowKind, part: string) =>
	!(rows ?? DEFAULT_ROWS)[kind].includes(part);

export function validateRows(v: unknown): string | null {
	if (typeof v !== 'object' || v === null) return '"rows" must be an object.';
	for (const [kind, hidden] of Object.entries(v)) {
		const parts = ROW_PARTS[kind as RowKind];
		if (!parts) return `Unknown setting "rows.${kind}".`;
		if (!Array.isArray(hidden)) return `"rows.${kind}" must be a list of the parts to hide.`;
		const unknown = hidden.find((id) => !parts.some((p) => p.id === id));
		if (unknown !== undefined)
			return `"rows.${kind}": unknown part "${unknown}". Parts: ${parts.map((p) => p.id).join(', ')}.`;
	}
	return null;
}
