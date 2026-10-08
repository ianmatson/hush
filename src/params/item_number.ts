import type { ParamMatcher } from '@sveltejs/kit';
import { isItemNumber } from '$lib/shared/item-page';

export const match: ParamMatcher = isItemNumber;
