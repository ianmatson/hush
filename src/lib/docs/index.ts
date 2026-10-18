import { Marked, type RendererObject, type Tokens } from 'marked';
import { SITE_URL } from '$lib/site';
import { escapeHtml, htmlToPlainText } from '$lib/shared/html';
import { REFERENCES, VALUES, keyMention, slug } from './reference';

/**
 * The docs (hush-gh.com/docs): one Markdown file per page in ./pages, in the order of NAV. A page
 * starts with its title and description:
 *
 *   ---
 *   title: Rules
 *   description: Sort threads your way…
 *   ---
 *
 * A line `{{ref:name}}` (or `{{ref:name args…}}`) is replaced by a table made from the app's own
 * tables (reference.ts), and `{{key:command.id}}` anywhere by that command's default keys, so no
 * page writes a key by hand.
 * Every page is also served as Markdown (/docs/<page>.md) and in /llms.txt, for agents.
 */

export interface MarkdownPage {
	slug: string;
	title: string;
	description: string;
	markdown: string;
}

export interface DocPage extends MarkdownPage {
	group: string;
}

export const NAV: { group: string; pages: string[] }[] = [
	{ group: 'Start', pages: ['', 'getting-started', 'github-access'] },
	{
		group: 'Use Hush',
		pages: ['views', 'pull-requests-and-issues', 'peek', 'notifications', 'feeds']
	},
	{
		group: 'Make it yours',
		pages: ['categories', 'query-language', 'keybinds', 'appearance-and-menus']
	},
	{ group: 'Reference', pages: ['settings', 'limits', 'agents', 'troubleshooting'] }
];

const FILES = import.meta.glob('./pages/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

/** A Markdown page with a title block (see above), and its {{ref:…}} and {{key:…}} filled in. */
export function readPage(
	file: string,
	raw: string
): { title: string; description: string; markdown: string } {
	const m = /^---\n([\s\S]*?)\n---\n/.exec(raw);
	if (!m) throw new Error(`${file} has no title block`);
	const meta = Object.fromEntries(
		m[1].split('\n').map((line) => {
			const i = line.indexOf(':');
			return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
		})
	);
	if (!meta.title || !meta.description) throw new Error(`${file} needs a title and a description`);
	const markdown = raw
		.slice(m[0].length)
		.replace(/^\{\{ref:([a-z-]+)((?: [^\s}]+)*)\}\}$/gm, (_, ref: string, args: string) => {
			const make = REFERENCES[ref];
			if (!make) throw new Error(`${file} asks for an unknown table {{ref:${ref}}}`);
			return make(args.trim().split(/\s+/).filter(Boolean));
		})
		.replace(/\{\{key:([\w.]+)\}\}/g, (_, id: string) => keyMention(id, file))
		.replace(/\{\{value:([a-z-]+)\}\}/g, (_, name: string) => {
			const value = VALUES[name];
			if (value === undefined)
				throw new Error(`${file} asks for an unknown value {{value:${name}}}`);
			return value;
		});
	if (/\{\{/.test(markdown)) throw new Error(`${file} has a {{…}} that Hush does not know`);
	return { title: meta.title, description: meta.description, markdown: markdown.trim() + '\n' };
}

const INDEX_FILE_NAME = 'index';
const pageFile = (slug: string) => `./pages/${slug || INDEX_FILE_NAME}.md`;

export function loadOrderedPages(
	files: Record<string, string>,
	order: readonly string[],
	label: string
): MarkdownPage[] {
	const pages = order.map((slug) => {
		const file = pageFile(slug);
		if (!(file in files)) throw new Error(`${label}: the list names ${file}, which does not exist`);
		return { slug, ...readPage(`${label}: ${file}`, files[file]) };
	});
	const listed = new Set(order.map(pageFile));
	const unlisted = Object.keys(files).filter((f) => !listed.has(f));
	if (unlisted.length) throw new Error(`${label}: not in the list: ${unlisted.join(', ')}`);
	return pages;
}

const groupOf = new Map(NAV.flatMap(({ group, pages }) => pages.map((s) => [s, group])));

/** Every page, in the order of the navigation. */
export const DOCS: DocPage[] = loadOrderedPages(
	FILES,
	NAV.flatMap((g) => g.pages),
	'docs'
).map((page) => ({ ...page, group: groupOf.get(page.slug)! }));

export const DOC_GROUPS: { group: string; pages: DocPage[] }[] = NAV.map(({ group }) => ({
	group,
	pages: DOCS.filter((d) => d.group === group)
}));

export const docBySlug = (s: string) => DOCS.find((d) => d.slug === s);
export const docPath = (d: Pick<DocPage, 'slug'>) => (d.slug ? `/docs/${d.slug}` : '/docs');
/** The Markdown copy of a page. */
export const docMarkdownPath = (d: Pick<DocPage, 'slug'>) =>
	`/docs/${d.slug || INDEX_FILE_NAME}.md`;
export const docSourceFile = (d: Pick<DocPage, 'slug'>) =>
	`src/lib/docs/pages/${d.slug || INDEX_FILE_NAME}.md`;
const HOME_NAV_TITLE = 'Overview';
export const navTitle = (p: Pick<MarkdownPage, 'slug' | 'title'>) =>
	p.slug ? p.title : HOME_NAV_TITLE;

export interface Rendered {
	html: string;
	/** The page's sections (its ## headings), for "On this page". */
	toc: { id: string; text: string }[];
}

const LINK_RENDERER: RendererObject = {
	link({ href, title, tokens }: Tokens.Link) {
		const inner = this.parser.parseInline(tokens);
		const external = /^https?:/.test(href) && !href.startsWith(SITE_URL);
		return `<a href="${escapeHtml(href)}"${title ? ` title="${escapeHtml(title)}"` : ''}${external ? ' rel="noreferrer"' : ''}>${inner}</a>`;
	}
};

export const renderInlineMarkdown = (markdown: string) =>
	new Marked({ gfm: true, renderer: LINK_RENDERER }).parseInline(markdown, {
		async: false
	}) as string;

/** Markdown as HTML. Headings get ids (and a link to themselves); tables can scroll sideways. */
export function renderMarkdown(markdown: string): Rendered {
	const toc: Rendered['toc'] = [];
	const used = new Map<string, number>();
	const marked = new Marked({
		gfm: true,
		renderer: {
			heading({ tokens, depth, text }: Tokens.Heading) {
				const inner = this.parser.parseInline(tokens);
				let id = slug(text) || 'section';
				const n = used.get(id) ?? 0;
				used.set(id, n + 1);
				if (n) id = `${id}-${n + 1}`;
				if (depth === 2) toc.push({ id, text: htmlToPlainText(inner) });
				return `<h${depth} id="${id}"><a class="anchor" href="#${id}">${inner}</a></h${depth}>\n`;
			},
			code({ text, lang }: Tokens.Code) {
				const language = (lang ?? '').split(/\s+/)[0];
				const label = language ? ` data-lang="${escapeHtml(language)}"` : '';
				return `<pre${label}><code>${escapeHtml(text)}</code></pre>\n`;
			},
			...LINK_RENDERER
		}
	});
	const html = (marked.parse(markdown, { async: false }) as string)
		.replace(/<table>/g, '<div class="table-scroll"><table>')
		.replace(/<\/table>/g, '</table></div>');
	return { html, toc };
}

/** A page as one Markdown file, for agents: its title, its description, and full URLs. */
export function asMarkdown(
	p: { title: string; description: string; markdown: string },
	path: string
): string {
	const body = p.markdown.replace(/\]\(\//g, `](${SITE_URL}/`);
	return `# ${p.title}\n\n> ${p.description}\n\nSource: ${SITE_URL}${path}\n\n${body}`;
}
