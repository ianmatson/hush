import { ABOUT } from '$lib/about';
import { COMPARE, COMPARE_INDEX, comparePath } from '$lib/compare';
import { DOCS, asMarkdown, docAsMarkdown } from '$lib/docs';

// Every docs page in one Markdown file, in the order of the navigation, then the about pages.
export const prerender = true;

export function GET() {
	return new Response(
		[
			...DOCS.map(docAsMarkdown),
			...ABOUT.map((p) => asMarkdown(p, `/${p.slug}`)),
			asMarkdown(COMPARE_INDEX, COMPARE_INDEX.path),
			...COMPARE.map((p) => asMarkdown(p, comparePath(p)))
		].join('\n\n---\n\n'),
		{
			headers: { 'Content-Type': 'text/plain; charset=utf-8' }
		}
	);
}
