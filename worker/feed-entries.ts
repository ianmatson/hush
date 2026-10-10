import type { DashItem } from '../src/lib/shared/types';

export interface FeedEntry {
	id: string;
	updated: string;
	title: string;
	link: string;
	author: string;
	category?: string;
	summary: string;
}

export function itemFeedEntry(i: DashItem): FeedEntry {
	return {
		id: i.id,
		updated: i.updatedAt,
		title: `${i.turnReason}: ${i.title}`,
		link: i.actionUrl,
		author: i.author,
		summary: `${i.repo}#${i.number}${i.lastCommentBy ? ` · last comment by @${i.lastCommentBy}` : ''}`
	};
}
