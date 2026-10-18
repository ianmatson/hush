import { markdownRoute } from '$lib/site-routes';

export const prerender = true;
const route = markdownRoute('guides');
export const entries = route.entries;
export const GET = route.GET;
