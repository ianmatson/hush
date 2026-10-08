import type { ParamMatcher } from '@sveltejs/kit';
import { isGitHubName } from '$lib/shared/item-page';

export const match: ParamMatcher = isGitHubName;
