import { asMarkdown } from '$lib/docs';
import { SITE_PAGES } from '$lib/site-pages';

// Every docs page in one Markdown file, in the order of the navigation, then the about pages.
export const prerender = true;

export function GET() {
	return new Response(SITE_PAGES.map((p) => asMarkdown(p, p.path)).join('\n\n---\n\n'), {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' }
	});
}
