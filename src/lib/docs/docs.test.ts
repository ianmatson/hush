import { describe, expect, it } from 'vitest';
import { parseQuery } from '$lib/shared/query';
import { DEFAULT_SETTINGS } from '$lib/shared/settings';
import { SETTINGS_DOCS, mergeSettings, validateSettings } from '$lib/shared/settings-schema';
import type { Settings } from '$lib/shared/types';
import { ABOUT } from '$lib/about';
import { DOCS, docPath, renderMarkdown } from '.';
import { SETTING_DETAILS } from './reference';

// The docs promise that they match the product: every setting is described, every example is
// valid, and every link goes somewhere.

const blocks = (tag: string) =>
	DOCS.flatMap((d) =>
		[...d.markdown.matchAll(new RegExp('```' + tag + '\\n([\\s\\S]*?)```', 'g'))].map((m) => ({
			page: d.slug || 'index',
			text: m[1]
		}))
	);

describe('docs', () => {
	it('describe every setting, and only real ones', () => {
		const keys = SETTINGS_DOCS.map((d) => d.key);
		expect(Object.keys(SETTING_DETAILS).sort()).toEqual([...keys].sort());
		expect(Object.keys(DEFAULT_SETTINGS).sort()).toEqual([...keys].sort());
	});

	it('have settings examples that Hush accepts', () => {
		const examples = blocks('json settings');
		expect(examples.length).toBeGreaterThan(10);
		for (const { page, text } of examples) {
			const patch = JSON.parse(text) as Partial<Settings>;
			const error = validateSettings(mergeSettings(DEFAULT_SETTINGS, patch), Object.keys(patch));
			expect(error, `${page}: ${text}`).toBeNull();
		}
	});

	it('have queries that parse with no errors', () => {
		const queries = [
			...blocks('query').map((b) => ({ page: b.page, text: b.text.trim() })),
			// The first column of the example tables ("| Query |" and "| When |").
			...DOCS.flatMap((d) =>
				d.markdown
					.split(/\n\n/)
					.filter((t) => /^\| (Query|When) +\|/.test(t))
					.flatMap((t) => t.split('\n').slice(2))
					.map((row) => ({ page: d.slug, text: /^\| `([^`]+)`/.exec(row)?.[1] ?? '' }))
			)
		];
		expect(queries.length).toBeGreaterThan(10);
		for (const { page, text } of queries) {
			expect(text, page).not.toBe('');
			expect(parseQuery(text).errors, `${page}: ${text}`).toEqual([]);
		}
	});

	it('link only to pages and sections that exist', () => {
		const pages = [
			...DOCS.map((d) => ({ path: docPath(d), markdown: d.markdown })),
			...ABOUT.map((p) => ({ path: `/${p.slug}`, markdown: p.markdown }))
		];
		const ids = new Map(
			pages.map((p) => [
				p.path,
				new Set([...renderMarkdown(p.markdown).html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]))
			])
		);
		const files = new Set([
			'/llms.txt',
			'/llms-full.txt',
			...DOCS.map((d) => `/docs/${d.slug || 'index'}.md`),
			...ABOUT.map((p) => `/${p.slug}.md`)
		]);
		for (const p of pages)
			for (const [, href] of renderMarkdown(p.markdown).html.matchAll(/ href="([^"]+)"/g)) {
				if (/^https?:/.test(href)) continue;
				const [path, hash] = href.split('#');
				const target = path || p.path;
				if (files.has(target)) continue;
				expect(ids.has(target), `${p.path} links to ${href}`).toBe(true);
				if (hash) expect(ids.get(target)!.has(hash), `${p.path} links to ${href}`).toBe(true);
			}
	});
});
