import type { DashItem } from '../src/lib/shared/types';
import { factsOf, type ThreadWithFacts } from './poller/schema';

export interface FeedEntry {
	id: string;
	updated: string;
	title: string;
	link: string;
	author: string;
	category?: string;
	summary: string;
}

export function threadFeedEntry(r: ThreadWithFacts): FeedEntry {
	const e = factsOf(r);
	const num = e?.number ? `#${e.number}` : '';
	return {
		id: r.id,
		updated: r.gh_updated_at,
		title: `${r.summary}: ${r.title}`,
		link: r.action_url,
		author: e?.author ?? r.repo,
		category: r.category,
		summary: `${r.repo}${num} · ${r.why}${e?.lastComment?.body ? `\n\n${e.lastComment.body}` : ''}`
	};
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
