import { describe, expect, it } from 'vitest';
import { LAST_CHECKED } from '$lib/site';
import { brokenLinksOf } from '$lib/site-links';
import { pagesOf } from '$lib/site-pages';
import { comparePath } from '.';
import { COMPARE, COMPARE_INDEX } from './content';

const sectionTitles = (markdown: string) =>
	[...markdown.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());

describe('compare pages', () => {
	it('name GitHub notifications in their title or description', () => {
		for (const page of COMPARE)
			expect(`${page.title} ${page.description}`, page.slug).toMatch(/GitHub notification/);
	});

	it('start with a summary that can be quoted', () => {
		for (const page of [...COMPARE, COMPARE_INDEX]) {
			expect(sectionTitles(page.markdown)[0], page.slug).toBe('Summary');
			expect(page.markdown, page.slug).toMatch(/^## Summary\n\n\*\*[^\n]+\*\*\n/);
		}
	});

	it('are fair to both sides, with a table and a choice', () => {
		for (const page of COMPARE) {
			const titles = sectionTitles(page.markdown);
			const betterTitles = titles.filter((t) => /^Where .+ is better$/.test(t));
			const chooseTitles = titles.filter((t) => /^Choose .+ if…$/.test(t));
			expect(betterTitles, page.slug).toHaveLength(2);
			expect(betterTitles, page.slug).toContain('Where Hush is better');
			expect(chooseTitles, page.slug).toHaveLength(2);
			expect(chooseTitles, page.slug).toContain('Choose Hush if…');
			expect(page.markdown, page.slug).toMatch(/^\| -+ \| -+ \| -+ \|$/m);
		}
	});

	it('end with their sources and the date they were checked', () => {
		for (const page of COMPARE) {
			const titles = sectionTitles(page.markdown);
			expect(titles.at(-1), page.slug).toBe('Sources');
			const sources = page.markdown.slice(page.markdown.indexOf('## Sources'));
			expect(sources.match(/\]\(https:\/\//g)?.length ?? 0, page.slug).toBeGreaterThan(1);
			expect(sources.trim().split('\n').at(-1), page.slug).toBe(`_Last checked: ${LAST_CHECKED}._`);
		}
	});

	it('are all listed on the overview', () => {
		for (const page of COMPARE) expect(COMPARE_INDEX.markdown).toContain(`](${comparePath(page)})`);
	});

	it('link only to pages and sections that exist', () => {
		for (const page of pagesOf('compare')) expect(brokenLinksOf(page), page.path).toEqual([]);
	});
});
