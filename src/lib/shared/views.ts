const CATEGORY_FEED_VIEW = /^c:([a-z0-9-]{1,40})$/;
const VIEW_FEED_VIEW = /^v:([a-z0-9-]{1,40})$/;

export const categoryFeedView = (id: string) => `c:${id}`;
export const viewFeedView = (id: string) => `v:${id}`;

export const parseCategoryFeed = (view: string): string | null =>
	CATEGORY_FEED_VIEW.exec(view)?.[1] ?? null;
export const parseViewFeed = (view: string): string | null =>
	VIEW_FEED_VIEW.exec(view)?.[1] ?? null;

export const feedViewOk = (view: string) =>
	parseViewFeed(view) !== null || parseCategoryFeed(view) !== null;
