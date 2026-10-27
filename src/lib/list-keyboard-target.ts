import { itemPagePathFromGitHubUrl } from '$lib/shared/item-page';
import type { DashItem } from '$lib/shared/types';

interface OpenItem {
	id: string;
	url: string;
}

export function listKeyboardTarget(
	peek: OpenItem | null,
	cursor: DashItem | undefined,
	selectedIds: string[],
	rows: DashItem[]
) {
	const item = peek ? rows.find((row) => row.id === peek.id) : cursor;
	const target = peek ?? cursor;
	return {
		item,
		target,
		ids: peek ? (item ? [item.id] : []) : selectedIds,
		urls: peek
			? [peek.url]
			: selectedIds.flatMap((id) => rows.find((row) => row.id === id)?.url ?? []),
		actionUrl: peek ? (item?.actionUrl ?? peek.url) : cursor?.actionUrl,
		fullPagePath: target ? itemPagePathFromGitHubUrl(target.url) : null
	};
}
