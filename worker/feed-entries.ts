import type { Row } from '../src/lib/model/types';

export interface FeedEntry {
	id: string;
	updated: string;
	title: string;
	link: string;
	author: string;
	category?: string;
	summary: string;
}

export function itemFeedEntry(i: Row): FeedEntry {
	return {
		id: i.id,
		updated: i.updatedAt,
		title: `${i.turnReason}: ${i.title}`,
		link: i.actionUrl,
		author: i.author,
		summary: `${i.repo}#${i.number}${i.lastHumanCommentBy ? ` · last comment by @${i.lastHumanCommentBy}` : ''}`
	};
}
