import type { ParamMatcher } from '@sveltejs/kit';
import { isItemPathSegment } from '$lib/shared/item-page';

export const match = ((param: string) => isItemPathSegment(param)) satisfies ParamMatcher;
