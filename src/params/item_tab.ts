import type { ParamMatcher } from '@sveltejs/kit';
import { isItemTab } from '$lib/shared/item-page';

export const match: ParamMatcher = isItemTab;
