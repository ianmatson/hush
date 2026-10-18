import { markdownRoute } from '$lib/site-routes';

// The pages for particular questions as Markdown, for agents: /privacy.md, /security.md, /pricing.md.
export const prerender = true;
const route = markdownRoute('about');
export const entries = route.entries;
export const GET = route.GET;
