import { ABOUT } from '$lib/about';
import { DOCS, NAV, docMarkdownPath } from '$lib/docs';
import { SITE_URL } from '$lib/site';

// The docs for agents, as https://llmstxt.org describes: what Hush is, then every page in
// Markdown. /llms-full.txt has the pages themselves.
export const prerender = true;

export function GET() {
	const groups = NAV.map(({ group }) => {
		const lines = DOCS.filter((d) => d.group === group).map(
			(d) =>
				`- [${d.slug ? d.title : 'Overview'}](${SITE_URL}${docMarkdownPath(d)}): ${d.description}`
		);
		return `## ${group}\n\n${lines.join('\n')}`;
	});
	const text = `# Hush

> Hush reads GitHub notifications and follows whose turn it is on every pull request and issue that involves you. It shows three lanes: Your turn (you must act next), Waiting (someone else must act), and Updates (a feed of the rest), and pushes only when something becomes your turn. The app is at https://app.hush-gh.com. Every setting is one JSON object (settings.json); the settings page documents all of it.

All pages in one file: ${SITE_URL}/llms-full.txt

${groups.join('\n\n')}

## About Hush

${ABOUT.map((p) => `- [${p.title}](${SITE_URL}/${p.slug}.md): ${p.description}`).join('\n')}
`;
	return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
