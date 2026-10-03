import { describe, expect, it } from 'vitest';
import { ABOUT } from '$lib/about';
import { COMPARE, COMPARE_INDEX, comparePath } from '$lib/compare';
import { DOCS, docPath, renderMarkdown } from '$lib/docs';
import { parseQuery } from '$lib/shared/query';
import { DEFAULT_SETTINGS } from '$lib/shared/settings';
import { mergeSettings, validateSettings } from '$lib/shared/settings-schema';
import type { Settings } from '$lib/shared/types';
import { GUIDES, GUIDES_INDEX, LAST_CHECKED, guidePath } from '.';

const SOURCES_HEADING = '## Sources';

const sectionTitles = (markdown: string) =>
	[...markdown.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());

const codeBlocks = (markdown: string, tag: string) =>
	[...markdown.matchAll(new RegExp('```' + tag + '\\n([\\s\\S]*?)```', 'g'))].map((m) => m[1]);

const withoutCode = (markdown: string) => markdown.replace(/```[\s\S]*?```/g, '');

const bodyBeforeSources = (markdown: string) => {
	const at = markdown.indexOf(SOURCES_HEADING);
	return at < 0 ? markdown : markdown.slice(0, at);
};

const externalLinks = (markdown: string) =>
	[...withoutCode(markdown).matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map((m) => m[1]);

const anchorsOf = (markdown: string) =>
	new Set([...renderMarkdown(markdown).html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));

describe('guides', () => {
	it('have a title that says what they do, and a description', () => {
		for (const guide of GUIDES) {
			expect(guide.title, guide.slug).toMatch(/^How to .*GitHub/);
			expect(guide.description.length, guide.slug).toBeGreaterThan(60);
			expect(guide.description.length, guide.slug).toBeLessThanOrEqual(240);
		}
	});

	it('start with a short answer that can be quoted', () => {
		for (const guide of GUIDES) {
			expect(sectionTitles(guide.markdown)[0], guide.slug).toBe('Short answer');
			expect(guide.markdown, guide.slug).toMatch(/^## Short answer\n\n\*\*[^\n]+\*\*\n/);
		}
	});

	it('have settings examples that Hush accepts', () => {
		for (const guide of GUIDES) {
			const examples = codeBlocks(guide.markdown, 'json settings');
			expect(examples.length, guide.slug).toBeGreaterThan(0);
			for (const text of examples) {
				const patch = JSON.parse(text) as Partial<Settings>;
				const error = validateSettings(mergeSettings(DEFAULT_SETTINGS, patch), Object.keys(patch));
				expect(error, `${guide.slug}: ${text}`).toBeNull();
			}
		}
	});

	it('have queries that parse with no errors', () => {
		for (const guide of GUIDES)
			for (const text of codeBlocks(guide.markdown, 'query'))
				expect(parseQuery(text.trim()).errors, `${guide.slug}: ${text}`).toEqual([]);
	});

	it('end with their sources and the date they were checked when they cite external facts', () => {
		for (const guide of GUIDES) {
			if (externalLinks(bodyBeforeSources(guide.markdown)).length === 0) continue;
			expect(sectionTitles(guide.markdown).at(-1), guide.slug).toBe('Sources');
			const sources = guide.markdown.slice(guide.markdown.indexOf(SOURCES_HEADING));
			expect(externalLinks(sources).length, guide.slug).toBeGreaterThan(0);
			expect(sources.trim().split('\n').at(-1), guide.slug).toBe(
				`_Last checked: ${LAST_CHECKED}._`
			);
		}
	});

	it('cite only sources over https', () => {
		for (const guide of GUIDES)
			for (const href of externalLinks(guide.markdown))
				expect(href, guide.slug).toMatch(/^https:\/\//);
	});

	it('link to the docs', () => {
		for (const guide of GUIDES) expect(guide.markdown, guide.slug).toMatch(/\]\(\/docs\//);
	});

	it('are all listed on the overview', () => {
		for (const guide of GUIDES) expect(GUIDES_INDEX.markdown).toContain(`](${guidePath(guide)})`);
	});

	it('link only to pages and sections that exist', () => {
		const pages = [
			...DOCS.map((d) => ({ path: docPath(d), markdown: d.markdown })),
			...ABOUT.map((p) => ({ path: `/${p.slug}`, markdown: p.markdown })),
			...COMPARE.map((p) => ({ path: comparePath(p), markdown: p.markdown })),
			{ path: COMPARE_INDEX.path, markdown: COMPARE_INDEX.markdown },
			...GUIDES.map((g) => ({ path: guidePath(g), markdown: g.markdown })),
			{ path: GUIDES_INDEX.path, markdown: GUIDES_INDEX.markdown }
		];
		const anchors = new Map(pages.map((p) => [p.path, anchorsOf(p.markdown)]));
		const guides = pages.filter(
			(p) => p.path === GUIDES_INDEX.path || p.path.startsWith(`${GUIDES_INDEX.path}/`)
		);
		for (const page of guides)
			for (const [, href] of renderMarkdown(page.markdown).html.matchAll(/ href="([^"]+)"/g)) {
				if (/^https:\/\//.test(href)) continue;
				const [path, hash] = href.split('#');
				const target = path || page.path;
				expect(anchors.has(target), `${page.path} links to ${href}`).toBe(true);
				if (hash)
					expect(anchors.get(target)!.has(hash), `${page.path} links to ${href}`).toBe(true);
			}
	});
});
