// Splits the SvelteKit build (build/) into the two Cloudflare deploys:
//   dist/app  → app.hush-gh.com: the app shell as index.html (SPA fallback), and the API Worker.
//   dist/site → hush-gh.com: the prerendered pages, with real 404s. Static files only.
// Both need the shared JS and CSS in _app/ and the icons.
import { createHash } from 'node:crypto';
import {
	cpSync,
	existsSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import { join, relative } from 'node:path';

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

const appDir = readdirSync(BUILD).find((d) => existsSync(join(BUILD, d, 'immutable')));
if (!appDir) throw new Error(`split: no immutable folder in ${BUILD}/`);

const APP_ICONS = ['icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
const PUSH_BADGE = 'badge-72.png';
const SERVICE_WORKER = 'service-worker.js';
const WEB_MANIFEST = 'manifest.webmanifest';
const APP_FILES = [appDir, shell, SERVICE_WORKER, WEB_MANIFEST, PUSH_BADGE, ...APP_ICONS];
const APP_ONLY_FILES = [shell, SERVICE_WORKER, WEB_MANIFEST, PUSH_BADGE];

const app = join(DIST, 'app');
for (const name of APP_FILES) {
	if (!existsSync(join(BUILD, name))) throw new Error(`split: the app needs ${BUILD}/${name}`);
	cpSync(join(BUILD, name), join(app, name), { recursive: true });
}
renameSync(join(app, shell), join(app, 'index.html'));
writeFileSync(
	join(app, '_redirects'),
	[
		'# The app starts at your start view; every other path gets the app shell (SPA fallback).',
		'/ /v 302',
		'/inbox /v 301',
		'/turn /v 301',
		'/waiting /v 301',
		'/updates /v 301',
		''
	].join('\n')
);
// Files in SvelteKit's immutable folder have a content hash in their names, so they never
// change: the browser keeps them and does not ask again (by default every file is checked on
// each use). The folder is found in the build, so a changed kit.appDir needs no change here.
const IMMUTABLE = `/${appDir}/immutable/*\n  Cache-Control: public, max-age=31536000, immutable\n`;
// Security headers for the app. Scripts: its own files, and the app shell's inline start-up
// script by its hash. Images: GitHub's servers (avatars, and images and emoji in comments, which
// the peek shows). Connections (the API and the live socket): the app itself only.
const inlineHashes = (html) =>
	[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
		(m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`
	);
const GITHUB_MEDIA =
	'https://github.com https://*.githubusercontent.com https://github.githubassets.com';
const appCsp = [
	"default-src 'self'",
	`script-src 'self' ${inlineHashes(readFileSync(join(BUILD, shell), 'utf8')).join(' ')}`,
	"style-src 'self' 'unsafe-inline'",
	`img-src 'self' data: ${GITHUB_MEDIA}`,
	`media-src 'self' ${GITHUB_MEDIA}`,
	"font-src 'self' data:",
	"connect-src 'self'",
	"worker-src 'self'",
	"manifest-src 'self'",
	"frame-src 'none'",
	"object-src 'none'",
	"base-uri 'none'",
	"form-action 'self'",
	"frame-ancestors 'none'"
].join('; ');
const SECURITY = (csp) =>
	`  Content-Security-Policy: ${csp}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()\n`;
writeFileSync(join(app, '_headers'), `/*\n${SECURITY(appCsp)}${IMMUTABLE}`);
writeFileSync(
	join(app, 'robots.txt'),
	'# The app is private: nothing here to index.\nUser-agent: *\nDisallow: /\n'
);

// --- The site: the prerendered pages and the shared assets, not the app.
const site = join(DIST, 'site');
cpSync(BUILD, site, {
	recursive: true,
	filter: (src) => !APP_ONLY_FILES.includes(relative(BUILD, src))
});
// Security headers. The site loads only its own code: scripts from this origin, and the inline
// scripts of the built pages by their hash (so an added or third-party script does not run).
const hashes = new Set(pages.flatMap((f) => inlineHashes(readFileSync(join(BUILD, f), 'utf8'))));
const csp = [
	"default-src 'self'",
	`script-src 'self' ${[...hashes].join(' ')}`,
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data:",
	"font-src 'self' data:",
	"connect-src 'self'",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	"frame-ancestors 'none'"
].join('; ');
const UTF8_TEXT = [
	['/*.md', 'text/markdown'],
	['/llms.txt', 'text/plain'],
	['/llms-full.txt', 'text/plain'],
	['/robots.txt', 'text/plain']
]
	.map(([path, type]) => `${path}\n  Content-Type: ${type}; charset=utf-8\n`)
	.join('');
writeFileSync(join(site, '_headers'), `/*\n${SECURITY(csp)}${IMMUTABLE}${UTF8_TEXT}`);
const SECTION_HOME_MARKDOWN = ['docs', 'guides', 'compare'].map(
	(section) => `/${section}.md /${section}/index.md 301`
);
// Docs pages of the reverted "lanes" layout.
writeFileSync(
	join(site, '_redirects'),
	[
		'/docs/your-turn /docs/pull-requests-and-issues 301',
		'/docs/your-turn.md /docs/pull-requests-and-issues.md 301',
		'/docs/inbox /docs/views 301',
		'/docs/inbox.md /docs/views.md 301',
		'/docs/where-hush-looks /docs/pull-requests-and-issues 301',
		'/docs/where-hush-looks.md /docs/pull-requests-and-issues.md 301',
		...SECTION_HOME_MARKDOWN,
		''
	].join('\n')
);
console.log(
	`split: ${pages.length} site pages → dist/site (${hashes.size} inline scripts in the CSP), app shell → dist/app`
);
