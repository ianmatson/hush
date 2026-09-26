/**
 * Where the app lives. Production: its own subdomain, apart from the public site (hush-gh.com).
 * Local development serves both from one host, so the links stay relative.
 */
export const APP_URL = import.meta.env.DEV ? '' : 'https://app.hush-gh.com';
