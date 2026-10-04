export type FeedSubject = 'category' | 'tag';

const FEED_PREFIX: Record<FeedSubject, string> = { category: 'c', tag: 't' };
const FEED_VIEW = /^([ct]):([a-z0-9-]{1,40})$/;

export const feedViewOf = (subject: FeedSubject, id: string) => `${FEED_PREFIX[subject]}:${id}`;

export function parseFeedView(view: string): { subject: FeedSubject; id: string } | null {
	const m = FEED_VIEW.exec(view);
	if (!m) return null;
	return { subject: m[1] === 'c' ? 'category' : 'tag', id: m[2] };
}

export const feedViewOk = (view: string) => parseFeedView(view) !== null;
