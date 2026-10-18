import type { MarkdownPage } from '$lib/docs';
import { LAST_CHECKED } from '$lib/site';

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

export const GUIDES_PATH = '/guides';
export const guidePath = (p: Pick<MarkdownPage, 'slug'>) => `${GUIDES_PATH}/${p.slug}`;
export const guideSourceFile = (p: Pick<MarkdownPage, 'slug'>) =>
	`src/lib/guides/pages/${p.slug}.md`;

export const GUIDES_INTRO = `Each guide starts with GitHub's own settings, which are free and often enough. Then it shows where Hush helps. We checked every fact on ${LAST_CHECKED}.`;
