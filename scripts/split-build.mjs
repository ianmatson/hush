// Splits the SvelteKit build (build/) into the two Cloudflare deploys:
//   dist/app  → app.hush-gh.com: the app shell as index.html (SPA fallback), and the API Worker.
//   dist/site → hush-gh.com: the prerendered pages, with real 404s. Static files only.
// Both need the shared JS and CSS in _app/ and the icons.
import {
	cpSync,
	mkdirSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import { join, relative } from 'node:path';

const APP_ORIGIN = 'https://app.hush-gh.com';
const BUILD = 'build';
const DIST = 'dist';

/** Every .html file in the build, as a path relative to it. */
function htmlFiles(dir = BUILD) {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return name === '_app' ? [] : htmlFiles(path);
		return name.endsWith('.html') ? [relative(BUILD, path)] : [];
	});
}

rmSync(DIST, { recursive: true, force: true });
const shell = 'app.html';
const pages = htmlFiles().filter((f) => f !== shell);

// --- The app: everything but the site's pages; the shell is its index.html.
const app = join(DIST, 'app');
cpSync(BUILD, app, { recursive: true, filter: (src) => !pages.includes(relative(BUILD, src)) });
renameSync(join(app, shell), join(app, 'index.html'));
writeFileSync(
	join(app, '_redirects'),
	'# The app starts at the inbox; every other path gets the app shell (SPA fallback).\n/ /inbox 302\n'
);
writeFileSync(
	join(app, 'robots.txt'),
	'# The app is private: nothing here to index.\nUser-agent: *\nDisallow: /\n'
);

// --- The site: the prerendered pages and the shared assets, not the app.
const site = join(DIST, 'site');
const appOnly = [shell, 'service-worker.js', 'manifest.webmanifest'];
cpSync(BUILD, site, { recursive: true, filter: (src) => !appOnly.includes(relative(BUILD, src)) });
// Old app links on hush-gh.com (before the app moved to its subdomain). This list is fixed: new
// app pages live only on the app host.
const moved = ['/inbox', '/pulls', '/issues', '/settings', '/login', '/feeds'];
writeFileSync(
	join(site, '_redirects'),
	'# The app moved to its own subdomain; old links go there (the query string is kept).\n' +
		moved
			.flatMap((p) => [`${p} ${APP_ORIGIN}${p} 301`, `${p}/* ${APP_ORIGIN}${p}/:splat 301`])
			.join('\n') +
		'\n'
);
// Browsers that had the app installed here still run its service worker: replace it with one that
// removes itself, so the old push subscriptions end.
writeFileSync(
	join(site, 'service-worker.js'),
	"self.addEventListener('install', () => self.skipWaiting());\n" +
		"self.addEventListener('activate', (e) => e.waitUntil(self.registration.unregister()));\n"
);
mkdirSync(DIST, { recursive: true });
console.log(`split: ${pages.length} site pages → dist/site, app shell → dist/app`);
