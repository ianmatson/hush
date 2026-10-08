import { describe, expect, it } from 'vitest';
import {
	buildFileTree,
	fileAnchor,
	filesInTreeOrder,
	foldedByDefault,
	isGeneratedFile,
	parsePatch,
	pullFilePageCount,
	splitPath,
	type FileTreeNode,
	type PullFile
} from './diff';

const file = (overrides: Partial<PullFile>): PullFile => ({
	sha: 'abc',
	filename: 'src/app.ts',
	status: 'modified',
	additions: 1,
	deletions: 1,
	changes: 2,
	blob_url: null,
	...overrides
});

describe('parsePatch', () => {
	it('numbers context, added, and deleted lines on each side', () => {
		const [hunk] = parsePatch(
			['@@ -10,4 +10,5 @@ function main() {', ' a', '-b', '+B', '+C', ' d', ' e'].join('\n')
		);
		expect(hunk).toMatchObject({
			oldStart: 10,
			oldLines: 4,
			newStart: 10,
			newLines: 5,
			section: 'function main() {'
		});
		expect(hunk.lines).toEqual([
			{ kind: 'context', text: 'a', oldLine: 10, newLine: 10 },
			{ kind: 'del', text: 'b', oldLine: 11, newLine: null },
			{ kind: 'add', text: 'B', oldLine: null, newLine: 11 },
			{ kind: 'add', text: 'C', oldLine: null, newLine: 12 },
			{ kind: 'context', text: 'd', oldLine: 12, newLine: 13 },
			{ kind: 'context', text: 'e', oldLine: 13, newLine: 14 }
		]);
	});

	it('reads several hunks, one-line counts, and the no-newline note', () => {
		const hunks = parsePatch(
			[
				'@@ -1 +1 @@',
				'-old',
				'\\ No newline at end of file',
				'+new',
				'@@ -20,0 +21,2 @@',
				'+x',
				'+y',
				''
			].join('\n')
		);
		expect(hunks).toHaveLength(2);
		expect(hunks[0]).toMatchObject({ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1 });
		expect(hunks[0].lines[1]).toEqual({
			kind: 'note',
			text: 'No newline at end of file',
			oldLine: null,
			newLine: null
		});
		expect(hunks[1].lines.map((l) => l.newLine)).toEqual([21, 22]);
	});

	it('keeps empty context lines and ignores text before the first hunk', () => {
		const [hunk] = parsePatch(['junk', '@@ -1,3 +1,3 @@', ' a', '', ' c'].join('\n'));
		expect(hunk.lines.map((l) => [l.kind, l.text, l.oldLine])).toEqual([
			['context', 'a', 1],
			['context', '', 2],
			['context', 'c', 3]
		]);
	});

	it('gives nothing for an empty patch', () => {
		expect(parsePatch('')).toEqual([]);
	});
});

describe('folding', () => {
	it('folds lock files, minified files, deleted files, and large diffs', () => {
		expect(isGeneratedFile('pnpm-lock.yaml')).toBe(true);
		expect(isGeneratedFile('web/dist/app.min.js')).toBe(true);
		expect(isGeneratedFile('src/lock.ts')).toBe(false);
		expect(foldedByDefault(file({ filename: 'a/package-lock.json' }))).toBe('generated');
		expect(foldedByDefault(file({ status: 'removed' }))).toBe('deleted');
		expect(foldedByDefault(file({ changes: 401 }))).toBe('large');
		expect(foldedByDefault(file({ changes: 400 }))).toBe(null);
	});
});

describe('pages and paths', () => {
	it('asks for one page per 100 files, from 1 up to GitHub’s 30', () => {
		expect(pullFilePageCount(0)).toBe(1);
		expect(pullFilePageCount(100)).toBe(1);
		expect(pullFilePageCount(101)).toBe(2);
		expect(pullFilePageCount(5000)).toBe(30);
	});

	it('splits a path into its folder and name', () => {
		expect(splitPath('src/lib/a.ts')).toEqual({ directory: 'src/lib/', name: 'a.ts' });
		expect(splitPath('README.md')).toEqual({ directory: '', name: 'README.md' });
	});

	it('makes an anchor that is safe in a URL fragment and differs per path', () => {
		expect(fileAnchor('src/a b.ts')).toMatch(/^file-[A-Za-z0-9._~-]+$/);
		expect(fileAnchor('src/a.ts')).not.toBe(fileAnchor('src/b.ts'));
	});
});

describe('buildFileTree', () => {
	const names = (nodes: FileTreeNode[]): unknown[] =>
		nodes.map((n) => (n.kind === 'file' ? n.name : { [n.name]: names(n.children) }));

	it('nests files in folders, folders first, and merges single-folder chains', () => {
		const tree = buildFileTree(
			[
				'.github/workflows/deploy.yml',
				'package.json',
				'src/components/guides/Action.tsx',
				'src/components/guides/figures.tsx',
				'src/constants/guides.ts',
				'README.md'
			].map((filename) => file({ filename }))
		);
		expect(names(tree)).toEqual([
			{ '.github/workflows': ['deploy.yml'] },
			{
				src: [{ 'components/guides': ['Action.tsx', 'figures.tsx'] }, { constants: ['guides.ts'] }]
			},
			'package.json',
			'README.md'
		]);
		const merged = tree[1].kind === 'folder' ? tree[1].children[0] : null;
		expect(merged).toMatchObject({ kind: 'folder', path: 'src/components/guides' });
	});

	it('lists the files in tree order', () => {
		const tree = buildFileTree(
			['z.ts', 'a/b.ts', 'a/a.ts', 'm.ts'].map((filename) => file({ filename }))
		);
		expect(filesInTreeOrder(tree).map((f) => f.filename)).toEqual([
			'a/a.ts',
			'a/b.ts',
			'm.ts',
			'z.ts'
		]);
	});
});
