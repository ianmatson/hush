import { describe, expect, it } from 'vitest';
import { parseQuery } from '$lib/shared/query';
import { DEFAULT_SETTINGS } from '$lib/shared/settings';
import { mergeSettings, validateSettings } from '$lib/shared/settings-schema';
import type { Settings } from '$lib/shared/types';
import { LAST_CHECKED } from '$lib/site';
import { brokenLinksOf } from '$lib/site-links';
import { pagesOf } from '$lib/site-pages';
import { guidePath } from '.';
import { GUIDES, GUIDES_INDEX } from './content';

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

describe('guides', () => {
	it('have a title that says what they do, and a description', () => {
		for (const guide of GUIDES) {
			expect(guide.title, guide.slug).toMatch(/^How to .*GitHub/);
			expect(guide.description.length, guide.slug).toBeGreaterThan(60);
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
		for (const page of pagesOf('guides')) expect(brokenLinksOf(page), page.path).toEqual([]);
	});
});
