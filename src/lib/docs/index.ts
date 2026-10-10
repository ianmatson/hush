import { Marked, type Tokens } from 'marked';
import { SITE_URL } from '$lib/site';
import { REFERENCES, keyMention, slug } from './reference';

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

export interface DocPage {
	/** The URL part after /docs/; "" is the docs home. */
	slug: string;
	title: string;
	description: string;
	group: string;
	/** The page's Markdown, with the {{ref:…}} lines filled in. */
	markdown: string;
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
		.replace(/\{\{key:([\w.]+)\}\}/g, (_, id: string) => keyMention(id, file));
	if (/\{\{/.test(markdown)) throw new Error(`${file} has a {{…}} that Hush does not know`);
	return { title: meta.title, description: meta.description, markdown: markdown.trim() + '\n' };
}

function parse(file: string, raw: string, group: string): DocPage {
	const name = file.replace(/^\.\/pages\//, '').replace(/\.md$/, '');
	return { slug: name === 'index' ? '' : name, group, ...readPage(`docs: ${file}`, raw) };
}

/** Every page, in the order of the navigation. */
export const DOCS: DocPage[] = NAV.flatMap(({ group, pages }) =>
	pages.map((s) => {
		const file = `./pages/${s || 'index'}.md`;
		if (!(file in FILES)) throw new Error(`docs: NAV lists ${file}, which does not exist`);
		return parse(file, FILES[file], group);
	})
);
{
	const listed = new Set(DOCS.map((d) => `./pages/${d.slug || 'index'}.md`));
	const extra = Object.keys(FILES).filter((f) => !listed.has(f));
	if (extra.length) throw new Error(`docs: not in NAV: ${extra.join(', ')}`);
}

export const docBySlug = (s: string) => DOCS.find((d) => d.slug === s);
export const docPath = (d: Pick<DocPage, 'slug'>) => (d.slug ? `/docs/${d.slug}` : '/docs');
/** The Markdown copy of a page. */
export const docMarkdownPath = (d: Pick<DocPage, 'slug'>) => `/docs/${d.slug || 'index'}.md`;

const esc = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface Rendered {
	html: string;
	/** The page's sections (its ## headings), for "On this page". */
	toc: { id: string; text: string }[];
}

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
				if (depth === 2) toc.push({ id, text: inner.replace(/<[^>]+>/g, '') });
				return `<h${depth} id="${id}"><a class="anchor" href="#${id}">${inner}</a></h${depth}>\n`;
			},
			code({ text, lang }: Tokens.Code) {
				const language = (lang ?? '').split(/\s+/)[0];
				const label = language ? ` data-lang="${esc(language)}"` : '';
				return `<pre${label}><code>${esc(text)}</code></pre>\n`;
			},
			link({ href, title, tokens }: Tokens.Link) {
				const inner = this.parser.parseInline(tokens);
				const external = /^https?:/.test(href) && !href.startsWith(SITE_URL);
				return `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''}${external ? ' rel="noreferrer"' : ''}>${inner}</a>`;
			}
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
export const docAsMarkdown = (d: DocPage) => asMarkdown(d, docPath(d));
