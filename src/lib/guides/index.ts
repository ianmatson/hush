import { readPage } from '$lib/docs';

export interface GuidePage {
	slug: string;
	title: string;
	description: string;
	markdown: string;
}

export const LAST_CHECKED = '3 October 2026';

export const GUIDE_ORDER = [
	'reduce-github-notifications',
	'github-review-requests',
	'github-push-notifications',
	'dependabot-notifications',
	'github-notifications-rss',
	'github-notifications-keyboard'
] as const;

export const GUIDE_LABELS: Record<(typeof GUIDE_ORDER)[number], string> = {
	'reduce-github-notifications': 'Reduce notification noise',
	'github-review-requests': 'Only your review requests',
	'github-push-notifications': 'Push to your phone',
	'dependabot-notifications': 'Quiet Dependabot and bots',
	'github-notifications-rss': 'Notifications in RSS',
	'github-notifications-keyboard': 'Triage with the keyboard'
};

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
export const guidePath = (p: Pick<GuidePage, 'slug'>) => `/guides/${p.slug}`;
export const guideMarkdownPath = (p: Pick<GuidePage, 'slug'>) => `/guides/${p.slug}.md`;
export const guideSourceFile = (p: Pick<GuidePage, 'slug'>) => `src/lib/guides/pages/${p.slug}.md`;

export const GUIDES_INTRO = `Each guide starts with GitHub's own settings, which are free and often enough. Then it shows where Hush helps. We checked every fact on ${LAST_CHECKED}.`;

export const GUIDES_INDEX: GuidePage & { path: string } = {
	slug: '',
	path: '/guides',
	title: 'GitHub notification guides',
	description:
		'Short how-to guides for GitHub notifications: less noise, only the review requests that need you, push to your phone, quiet bots, RSS feeds, and keyboard triage.',
	markdown: `${GUIDES_INTRO}

${GUIDES.map((g) => `- [${g.title}](${guidePath(g)}): ${g.description}`).join('\n')}
`
};
