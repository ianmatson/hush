import { SITE_URL } from '$lib/site';
import { SITE_PAGES, type SitePage } from '$lib/site-pages';

// The docs for agents, as https://llmstxt.org describes: what Hush is, then every page in
// Markdown. /llms-full.txt has the pages themselves.
export const prerender = true;

const TEXT_HEADERS = { 'Content-Type': 'text/plain; charset=utf-8' };

function byGroup(pages: SitePage[]): Map<string, SitePage[]> {
	const groups = new Map<string, SitePage[]>();
	for (const page of pages) groups.set(page.group, [...(groups.get(page.group) ?? []), page]);
	return groups;
}

export function GET() {
	const groups = [...byGroup(SITE_PAGES)].map(([group, pages]) => {
		const lines = pages.map(
			(p) => `- [${p.navTitle}](${SITE_URL}${p.markdownPath}): ${p.description}`
		);
		return `## ${group}\n\n${lines.join('\n')}`;
	});
	const text = `# Hush

> Hush shows the pull requests and issues that you work on as views: GitHub searches that stay live, with Hush-only words such as size: and category:, grouped by your role, status, a project board, or your own sections. It shows whose turn it is on each item, pushes only the facts that you choose, and never changes your GitHub notifications. The app is at https://app.hush-gh.com. Every setting is one JSON object (settings.json); the settings page documents all of it.

All pages in one file: ${SITE_URL}/llms-full.txt

${groups.join('\n\n')}
`;
	return new Response(text, { headers: TEXT_HEADERS });
}
