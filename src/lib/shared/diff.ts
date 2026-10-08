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

export type FoldReason = 'generated' | 'large' | 'deleted' | null;

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
