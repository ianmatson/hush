import { markdownRoute } from '$lib/site-routes';

// Each docs page as Markdown, for agents: /docs/settings.md. The docs home is /docs/index.md.
export const prerender = true;
const route = markdownRoute('docs');
export const entries = route.entries;
export const GET = route.GET;
