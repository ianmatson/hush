export const PULL_FILES_PER_PAGE = 100;
export const PULL_FILES_MAX_PAGES = 30;
export const LARGE_FILE_CHANGES = 400;

export type PullFileStatus =
	'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';

export interface PullFile {
	sha: string | null;
	filename: string;
	previous_filename?: string;
	status: PullFileStatus;
	additions: number;
	deletions: number;
	changes: number;
	blob_url: string | null;
	patch?: string;
}

export type DiffLineKind = 'context' | 'add' | 'del' | 'note';

export interface DiffLine {
	kind: DiffLineKind;
	text: string;
	oldLine: number | null;
	newLine: number | null;
}

export interface DiffHunk {
	oldStart: number;
	oldLines: number;
	newStart: number;
	newLines: number;
	section: string;
	lines: DiffLine[];
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;

const LINE_KIND_BY_PREFIX: Record<string, DiffLineKind> = {
	'+': 'add',
	'-': 'del',
	' ': 'context',
	'\\': 'note'
};

export function parsePatch(patch: string): DiffHunk[] {
	const hunks: DiffHunk[] = [];
	let hunk: DiffHunk | null = null;
	let oldLine = 0;
	let newLine = 0;
	const rows = patch.split('\n');
	if (rows.at(-1) === '') rows.pop();
	for (const row of rows) {
		const header = HUNK_HEADER.exec(row);
		if (header) {
			hunk = {
				oldStart: Number(header[1]),
				oldLines: header[2] === undefined ? 1 : Number(header[2]),
				newStart: Number(header[3]),
				newLines: header[4] === undefined ? 1 : Number(header[4]),
				section: header[5].trim(),
				lines: []
			};
			hunks.push(hunk);
			oldLine = hunk.oldStart;
			newLine = hunk.newStart;
			continue;
		}
		if (!hunk) continue;
		const kind = LINE_KIND_BY_PREFIX[row[0]] ?? 'context';
		const text = row.length ? row.slice(1) : '';
		if (kind === 'note') {
			hunk.lines.push({ kind, text: text.trim(), oldLine: null, newLine: null });
		} else if (kind === 'add') {
			hunk.lines.push({ kind, text, oldLine: null, newLine: newLine++ });
		} else if (kind === 'del') {
			hunk.lines.push({ kind, text, oldLine: oldLine++, newLine: null });
		} else {
			hunk.lines.push({ kind, text, oldLine: oldLine++, newLine: newLine++ });
		}
	}
	return hunks;
}

const GENERATED_FILE_NAMES = new Set([
	'pnpm-lock.yaml',
	'package-lock.json',
	'yarn.lock',
	'bun.lockb',
	'Cargo.lock',
	'poetry.lock',
	'uv.lock',
	'Gemfile.lock',
	'composer.lock',
	'go.sum',
	'Pipfile.lock'
]);
const GENERATED_FILE_SUFFIXES = ['.min.js', '.min.css', '.map', '.snap'];

export function isGeneratedFile(path: string): boolean {
	const name = path.slice(path.lastIndexOf('/') + 1);
	return GENERATED_FILE_NAMES.has(name) || GENERATED_FILE_SUFFIXES.some((s) => name.endsWith(s));
}

export type FoldReason = 'generated' | 'large' | 'deleted' | 'viewed' | null;

export function foldedByDefault(file: PullFile): FoldReason {
	if (isGeneratedFile(file.filename)) return 'generated';
	if (file.status === 'removed') return 'deleted';
	if (file.changes > LARGE_FILE_CHANGES) return 'large';
	return null;
}

export function pullFilePageCount(changedFiles: number): number {
	return Math.min(PULL_FILES_MAX_PAGES, Math.max(1, Math.ceil(changedFiles / PULL_FILES_PER_PAGE)));
}

export function splitPath(path: string): { directory: string; name: string } {
	const slash = path.lastIndexOf('/');
	return slash < 0
		? { directory: '', name: path }
		: { directory: path.slice(0, slash + 1), name: path.slice(slash + 1) };
}

export function fileAnchor(path: string): string {
	return `file-${encodeURIComponent(path).replace(/%/g, '')}`;
}

export interface FileTreeFile {
	kind: 'file';
	name: string;
	file: PullFile;
}

export interface FileTreeFolder {
	kind: 'folder';
	name: string;
	path: string;
	children: FileTreeNode[];
}

export type FileTreeNode = FileTreeFile | FileTreeFolder;

function sortTree(nodes: FileTreeNode[]): FileTreeNode[] {
	return nodes
		.sort((a, b) =>
			a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1
		)
		.map((node) =>
			node.kind === 'folder' ? { ...node, children: sortTree(node.children) } : node
		);
}

function mergeSingleFolderChains(node: FileTreeNode): FileTreeNode {
	if (node.kind === 'file') return node;
	let folder = node;
	while (folder.children.length === 1 && folder.children[0].kind === 'folder') {
		const only = folder.children[0];
		folder = { ...only, name: `${folder.name}/${only.name}` };
	}
	return { ...folder, children: folder.children.map(mergeSingleFolderChains) };
}

export function buildFileTree(files: PullFile[]): FileTreeNode[] {
	const root: FileTreeFolder = { kind: 'folder', name: '', path: '', children: [] };
	for (const file of files) {
		const parts = file.filename.split('/');
		const name = parts.pop()!;
		let folder = root;
		for (const part of parts) {
			const path = folder.path ? `${folder.path}/${part}` : part;
			let next = folder.children.find(
				(n): n is FileTreeFolder => n.kind === 'folder' && n.name === part
			);
			if (!next) {
				next = { kind: 'folder', name: part, path, children: [] };
				folder.children.push(next);
			}
			folder = next;
		}
		folder.children.push({ kind: 'file', name, file });
	}
	return sortTree(root.children).map(mergeSingleFolderChains);
}

export function filesInTreeOrder(tree: FileTreeNode[]): PullFile[] {
	return tree.flatMap((node) =>
		node.kind === 'file' ? [node.file] : filesInTreeOrder(node.children)
	);
}

const COMMIT_OID = /^[0-9a-f]{7,40}$/;

export const isCommitOid = (value: unknown): value is string =>
	typeof value === 'string' && COMMIT_OID.test(value);

export type FileViewedState = 'VIEWED' | 'DISMISSED';

export type ViewedFiles = Record<string, FileViewedState>;

export type CompareStatus = 'ahead' | 'behind' | 'diverged' | 'identical';

export interface CompareResult {
	status: CompareStatus;
	total_commits: number;
	files?: PullFile[];
}

export const comparesOnlyNewCommits = (status: CompareStatus) =>
	status === 'ahead' || status === 'identical';

export interface PullCommit {
	oid: string;
	headline: string;
	merge: boolean;
	at: string;
}

export interface CommitDiff {
	sha: string;
	files?: PullFile[];
}

export type ReviewRange =
	| { kind: 'all' }
	| { kind: 'reviewed-commit-missing' }
	| { kind: 'combined'; commits: PullCommit[] }
	| { kind: 'by-commit'; commits: PullCommit[] };

export function rangeSinceReview(commits: PullCommit[], reviewedOid: string): ReviewRange {
	const reviewedAt = commits.findIndex((c) => c.oid === reviewedOid);
	if (reviewedAt < 0) return { kind: 'reviewed-commit-missing' };
	const newCommits = commits.slice(reviewedAt + 1);
	if (!newCommits.length) return { kind: 'all' };
	return newCommits.some((c) => c.merge)
		? { kind: 'by-commit', commits: newCommits.filter((c) => !c.merge) }
		: { kind: 'combined', commits: newCommits };
}

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
	ts: 'typescript',
	mts: 'typescript',
	cts: 'typescript',
	tsx: 'tsx',
	js: 'javascript',
	mjs: 'javascript',
	cjs: 'javascript',
	jsx: 'jsx',
	json: 'json',
	jsonc: 'jsonc',
	md: 'markdown',
	mdx: 'mdx',
	svelte: 'svelte',
	vue: 'vue',
	astro: 'astro',
	py: 'python',
	rb: 'ruby',
	go: 'go',
	rs: 'rust',
	java: 'java',
	kt: 'kotlin',
	kts: 'kotlin',
	swift: 'swift',
	c: 'c',
	h: 'c',
	cc: 'cpp',
	cpp: 'cpp',
	hpp: 'cpp',
	cs: 'csharp',
	php: 'php',
	sh: 'shellscript',
	bash: 'shellscript',
	zsh: 'shellscript',
	yml: 'yaml',
	yaml: 'yaml',
	toml: 'toml',
	sql: 'sql',
	css: 'css',
	scss: 'scss',
	sass: 'sass',
	less: 'less',
	html: 'html',
	htm: 'html',
	xml: 'xml',
	svg: 'xml',
	graphql: 'graphql',
	gql: 'graphql',
	ex: 'elixir',
	exs: 'elixir',
	scala: 'scala',
	lua: 'lua',
	dart: 'dart',
	tf: 'hcl',
	hcl: 'hcl',
	ini: 'ini',
	prisma: 'prisma',
	proto: 'proto',
	r: 'r',
	hs: 'haskell',
	clj: 'clojure',
	erl: 'erlang',
	zig: 'zig',
	nix: 'nix',
	hbs: 'handlebars',
	pl: 'perl',
	ps1: 'powershell',
	groovy: 'groovy',
	ml: 'ocaml',
	fs: 'fsharp',
	jl: 'julia',
	sol: 'solidity',
	tex: 'latex'
};

const LANGUAGE_BY_FILE_NAME: Record<string, string> = {
	Dockerfile: 'dockerfile',
	Makefile: 'make',
	Gemfile: 'ruby',
	Rakefile: 'ruby',
	'.bashrc': 'shellscript',
	'.zshrc': 'shellscript'
};

export function languageForPath(path: string): string | null {
	const { name } = splitPath(path);
	if (LANGUAGE_BY_FILE_NAME[name]) return LANGUAGE_BY_FILE_NAME[name];
	if (name.startsWith('Dockerfile.')) return 'dockerfile';
	const dot = name.lastIndexOf('.');
	if (dot <= 0) return null;
	return LANGUAGE_BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? null;
}

export interface HunkSides {
	oldText: string;
	newText: string;
	sideLine: { side: 'old' | 'new'; index: number }[];
}

export function hunkSides(hunk: DiffHunk): HunkSides {
	const oldLines: string[] = [];
	const newLines: string[] = [];
	const sideLine: HunkSides['sideLine'] = [];
	for (const line of hunk.lines) {
		if (line.kind === 'del') {
			sideLine.push({ side: 'old', index: oldLines.length });
			oldLines.push(line.text);
		} else if (line.kind === 'note') {
			sideLine.push({ side: 'new', index: -1 });
		} else {
			if (line.kind === 'context') oldLines.push(line.text);
			sideLine.push({ side: 'new', index: newLines.length });
			newLines.push(line.text);
		}
	}
	return { oldText: oldLines.join('\n'), newText: newLines.join('\n'), sideLine };
}

export interface SplitRow {
	left: { line: DiffLine; at: number } | null;
	right: { line: DiffLine; at: number } | null;
}

export function splitRows(hunk: DiffHunk): SplitRow[] {
	const rows: SplitRow[] = [];
	let dels: { line: DiffLine; at: number }[] = [];
	let adds: { line: DiffLine; at: number }[] = [];
	const flush = () => {
		for (let i = 0; i < Math.max(dels.length, adds.length); i++)
			rows.push({ left: dels[i] ?? null, right: adds[i] ?? null });
		dels = [];
		adds = [];
	};
	hunk.lines.forEach((line, at) => {
		if (line.kind === 'del') {
			if (adds.length) flush();
			dels.push({ line, at });
		} else if (line.kind === 'add') {
			adds.push({ line, at });
		} else {
			flush();
			rows.push({ left: { line, at }, right: { line, at } });
		}
	});
	flush();
	return rows;
}

export interface ThreadComment {
	id: string;
	author: { login: string; avatar: string | null };
	html: string;
	body: string;
	at: string;
	url: string;
	pending: boolean;
	canEdit: boolean;
	canDelete: boolean;
}

export interface PendingReview {
	id: string;
	comments: number;
}

export type ReviewEvent = 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES';

export interface ReviewThread {
	id: string;
	path: string;
	line: number | null;
	startLine: number | null;
	side: 'LEFT' | 'RIGHT';
	outdated: boolean;
	resolved: boolean;
	fileLevel: boolean;
	canReply: boolean;
	canResolve: boolean;
	canUnresolve: boolean;
	comments: ThreadComment[];
	totalComments: number;
}

export const threadAnchor = (side: 'LEFT' | 'RIGHT', line: number) => `${side}:${line}`;

export function lineAnchors(line: DiffLine): string[] {
	const anchors: string[] = [];
	if (line.newLine !== null) anchors.push(threadAnchor('RIGHT', line.newLine));
	if (line.oldLine !== null) anchors.push(threadAnchor('LEFT', line.oldLine));
	return anchors;
}

export interface PlacedThreads {
	atLine: Map<string, ReviewThread[]>;
	atTop: ReviewThread[];
}

export function placeThreads(threads: ReviewThread[], hunks: DiffHunk[]): PlacedThreads {
	const shown = new Set(hunks.flatMap((h) => h.lines.flatMap(lineAnchors)));
	const atLine = new Map<string, ReviewThread[]>();
	const atTop: ReviewThread[] = [];
	for (const thread of threads) {
		const anchor =
			thread.line !== null && !thread.outdated && !thread.fileLevel
				? threadAnchor(thread.side, thread.line)
				: null;
		if (anchor && shown.has(anchor)) atLine.set(anchor, [...(atLine.get(anchor) ?? []), thread]);
		else atTop.push(thread);
	}
	return { atLine, atTop };
}

export function threadsByPath(threads: ReviewThread[]): Map<string, ReviewThread[]> {
	const byPath = new Map<string, ReviewThread[]>();
	for (const thread of threads)
		byPath.set(thread.path, [...(byPath.get(thread.path) ?? []), thread]);
	return byPath;
}

export type DiffSide = 'LEFT' | 'RIGHT';

export interface CommentTarget {
	path: string;
	side: DiffSide;
	line: number;
	startSide: DiffSide | null;
	startLine: number | null;
}

function lineSide(line: DiffLine): { side: DiffSide; line: number } | null {
	if (line.kind === 'del' && line.oldLine !== null) return { side: 'LEFT', line: line.oldLine };
	if (line.kind !== 'note' && line.newLine !== null) return { side: 'RIGHT', line: line.newLine };
	return null;
}

export function commentTarget(
	path: string,
	hunk: DiffHunk,
	fromIndex: number,
	toIndex: number
): CommentTarget | null {
	const first = Math.min(fromIndex, toIndex);
	const last = Math.max(fromIndex, toIndex);
	const start = hunk.lines[first] && lineSide(hunk.lines[first]);
	const end = hunk.lines[last] && lineSide(hunk.lines[last]);
	if (!start || !end) return null;
	const single = first === last;
	return {
		path,
		side: end.side,
		line: end.line,
		startSide: single ? null : start.side,
		startLine: single ? null : start.line
	};
}

export function selectedNewText(hunk: DiffHunk, fromIndex: number, toIndex: number): string | null {
	const lines = hunk.lines.slice(Math.min(fromIndex, toIndex), Math.max(fromIndex, toIndex) + 1);
	if (lines.some((l) => l.kind === 'del' || l.kind === 'note')) return null;
	return lines.map((l) => l.text).join('\n');
}

const SUGGESTION_FENCE = '```suggestion';
const SUGGESTION = /```suggestion\r?\n([\s\S]*?)\r?\n?```/;

export const suggestionBlock = (text: string) => `${SUGGESTION_FENCE}\n${text}\n\`\`\``;

export function suggestionIn(body: string): string | null {
	const match = SUGGESTION.exec(body);
	return match ? match[1] : null;
}
