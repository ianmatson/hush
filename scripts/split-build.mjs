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

// Files only the site uses.
const siteOnly = [...pages, 'sitemap.xml', 'og.png'];

// --- The app: everything but the site's files; the shell is its index.html.
const app = join(DIST, 'app');
cpSync(BUILD, app, { recursive: true, filter: (src) => !siteOnly.includes(relative(BUILD, src)) });
renameSync(join(app, shell), join(app, 'index.html'));
writeFileSync(
	join(app, '_redirects'),
	'# The app starts at the inbox; every other path gets the app shell (SPA fallback).\n/ /inbox 302\n'
);
// Files in SvelteKit's immutable folder have a content hash in their names, so they never
// change: the browser keeps them and does not ask again (by default every file is checked on
// each use). The folder is found in the build, so a changed kit.appDir needs no change here.
const appDir = readdirSync(BUILD).find((d) => existsSync(join(BUILD, d, 'immutable')));
if (!appDir) throw new Error(`split: no immutable folder in ${BUILD}/`);
const IMMUTABLE = `/${appDir}/immutable/*\n  Cache-Control: public, max-age=31536000, immutable\n`;
writeFileSync(join(app, '_headers'), IMMUTABLE);
writeFileSync(
	join(app, 'robots.txt'),
	'# The app is private: nothing here to index.\nUser-agent: *\nDisallow: /\n'
);

// --- The site: the prerendered pages and the shared assets, not the app.
const site = join(DIST, 'site');
const appOnly = [shell, 'service-worker.js', 'manifest.webmanifest'];
cpSync(BUILD, site, { recursive: true, filter: (src) => !appOnly.includes(relative(BUILD, src)) });
// Security headers. The site loads only its own code: scripts from this origin, and the inline
// scripts of the built pages by their hash (so an added or third-party script does not run).
const hashes = new Set(
	pages.flatMap((f) =>
		[...readFileSync(join(BUILD, f), 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
			(m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`
		)
	)
);
const csp = [
	"default-src 'self'",
	`script-src 'self' ${[...hashes].join(' ')}`,
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data:",
	"font-src 'self'",
	"connect-src 'self'",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	"frame-ancestors 'none'"
].join('; ');
writeFileSync(
	join(site, '_headers'),
	`/*\n  Content-Security-Policy: ${csp}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n${IMMUTABLE}`
);
console.log(
	`split: ${pages.length} site pages → dist/site (${hashes.size} inline scripts in the CSP), app shell → dist/app`
);
