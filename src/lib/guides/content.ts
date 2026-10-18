import { loadOrderedPages, type MarkdownPage } from '$lib/docs';
import { GUIDE_ORDER, GUIDES_INTRO, GUIDES_PATH, guidePath } from '.';

const FILES = import.meta.glob('./pages/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

export const GUIDES: MarkdownPage[] = loadOrderedPages(FILES, GUIDE_ORDER, 'guides');

export const GUIDES_INDEX: MarkdownPage & { path: string } = {
	slug: '',
	path: GUIDES_PATH,
	title: 'GitHub notification guides',
	description:
		'Short how-to guides for GitHub notifications: less noise, only the review requests that need you, push to your phone, quiet bots, RSS, and keyboard triage.',
	markdown: `${GUIDES_INTRO}

${GUIDES.map((g) => `- [${g.title}](${guidePath(g)}): ${g.description}`).join('\n')}
`
};
