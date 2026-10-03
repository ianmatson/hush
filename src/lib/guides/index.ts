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

export const guidePath = (p: Pick<GuidePage, 'slug'>) => `/guides/${p.slug}`;
export const guideMarkdownPath = (p: Pick<GuidePage, 'slug'>) => `/guides/${p.slug}.md`;
export const guideSourceFile = (p: Pick<GuidePage, 'slug'>) => `src/lib/guides/pages/${p.slug}.md`;

export const GUIDES_INTRO = `Each guide starts with GitHub's own settings, which are free and often enough. Then it shows where Hush helps. We checked every fact on ${LAST_CHECKED}.`;

export const GUIDES_PATH = '/guides';
