// Public pages (front page, docs, 404): rendered to HTML at build time, so crawlers and link
// previews get the full page. They are static files; no Worker runs for them.
export const prerender = true;
