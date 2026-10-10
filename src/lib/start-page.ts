import type { ItemView } from './shared/types';

export const START_PAGE_KEY = 'hush:start';

export function startPath(views: Pick<ItemView, 'id'>[], saved: string | null): string {
	const chosen = views.find((v) => saved === `/v/${v.id}`) ?? views[0];
	return `/v/${chosen.id}`;
}
