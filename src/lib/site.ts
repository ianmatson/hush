/** The public site (prerendered pages, for people and crawlers). */
export const SITE_URL = 'https://hush-gh.com';

export const SITE_NAME = 'Hush for GitHub';
export const SHORT_NAME = 'Hush';

/**
 * Where the app lives: its own subdomain. Local development serves both from one host, so links
 * stay relative there.
 */
export const APP_URL = import.meta.env.DEV ? '' : 'https://app.hush-gh.com';

/** The source code. */
export const REPO_URL = 'https://github.com/ianmatson/hush';

export const SUPPORT_EMAIL = 'support@hush-gh.com';
