import { markdownRoute } from '$lib/site-routes';

export const prerender = true;
const route = markdownRoute('compare');
export const entries = route.entries;
export const GET = route.GET;
