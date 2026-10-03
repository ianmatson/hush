import { describe, expect, it } from 'vitest';
import { ABOUT } from '$lib/about';
import { DOCS, docPath, renderMarkdown } from '$lib/docs';
import { LAST_CHECKED, comparePath } from '.';
import { COMPARE, COMPARE_INDEX } from './content';

const sectionTitles = (markdown: string) =>
	[...markdown.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());

const anchorsOf = (markdown: string) =>
	new Set([...renderMarkdown(markdown).html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));

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
		const pages = [
			...DOCS.map((d) => ({ path: docPath(d), markdown: d.markdown })),
			...ABOUT.map((p) => ({ path: `/${p.slug}`, markdown: p.markdown })),
			...COMPARE.map((p) => ({ path: comparePath(p), markdown: p.markdown })),
			{ path: COMPARE_INDEX.path, markdown: COMPARE_INDEX.markdown }
		];
		const anchors = new Map(pages.map((p) => [p.path, anchorsOf(p.markdown)]));
		const comparisons = pages.filter((p) => p.path.startsWith(COMPARE_INDEX.path));
		for (const page of comparisons)
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
