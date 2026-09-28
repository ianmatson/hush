import { DOCS, docAsMarkdown } from '$lib/docs';

// Every docs page in one Markdown file, in the order of the navigation.
export const prerender = true;

export function GET() {
	return new Response(DOCS.map(docAsMarkdown).join('\n\n---\n\n'), {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' }
	});
}
