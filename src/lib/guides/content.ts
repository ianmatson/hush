import { readPage } from '$lib/docs';
import { GUIDE_ORDER, GUIDES_INTRO, GUIDES_PATH, guidePath, type GuidePage } from '.';

const FILES = import.meta.glob('./pages/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

export const GUIDES: GuidePage[] = GUIDE_ORDER.map((slug) => {
	const file = `./pages/${slug}.md`;
	if (!(file in FILES)) throw new Error(`guides: GUIDE_ORDER lists ${file}, which does not exist`);
	return { slug, ...readPage(`guides: ${slug}.md`, FILES[file]) };
});
{
	const listed = new Set(GUIDE_ORDER.map((s) => `./pages/${s}.md`));
	const unlisted = Object.keys(FILES).filter((f) => !listed.has(f));
	if (unlisted.length) throw new Error(`guides: not in GUIDE_ORDER: ${unlisted.join(', ')}`);
}

export const guideBySlug = (s: string) => GUIDES.find((p) => p.slug === s);
export const GUIDES_INDEX: GuidePage & { path: string } = {
	slug: '',
	path: GUIDES_PATH,
	title: 'GitHub notification guides',
	description:
		'Short how-to guides for GitHub notifications: less noise, only the review requests that need you, push to your phone, quiet bots, RSS feeds, and keyboard triage.',
	markdown: `${GUIDES_INTRO}

${GUIDES.map((g) => `- [${g.title}](${guidePath(g)}): ${g.description}`).join('\n')}
`
};
