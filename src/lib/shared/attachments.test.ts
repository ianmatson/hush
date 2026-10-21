import { describe, expect, it } from 'vitest';
import {
	attachmentMarkdown,
	attachmentName,
	attachmentProblem,
	canAttach,
	insertBlock
} from './attachments';

const MB = 1024 * 1024;

describe('attachmentProblem', () => {
	it('accepts the images and videos GitHub accepts', () => {
		expect(attachmentProblem({ name: 'a.png', type: 'image/png', size: 1 })).toBeNull();
		expect(attachmentProblem({ name: 'a.mov', type: 'video/quicktime', size: 50 * MB })).toBeNull();
	});
	it('refuses other types, empty files, and files over the limit', () => {
		expect(attachmentProblem({ name: 'a.pdf', type: 'application/pdf', size: 1 })).toMatch(
			/accepts only/
		);
		expect(attachmentProblem({ name: 'a.png', type: 'image/png', size: 0 })).toMatch(/empty/);
		expect(attachmentProblem({ name: 'a.png', type: 'image/png', size: 10 * MB + 1 })).toMatch(
			/10 MB/
		);
		expect(attachmentProblem({ name: 'a.mp4', type: 'video/mp4', size: 100 * MB + 1 })).toMatch(
			/100 MB/
		);
	});
});

describe('canAttach', () => {
	it('allows writers, and an unknown permission (GitHub decides)', () => {
		expect(canAttach('WRITE')).toBe(true);
		expect(canAttach('ADMIN')).toBe(true);
		expect(canAttach(null)).toBe(true);
	});
	it('refuses read and triage', () => {
		expect(canAttach('READ')).toBe(false);
		expect(canAttach('TRIAGE')).toBe(false);
	});
});

describe('attachmentName', () => {
	it('keeps the base name only', () => {
		expect(attachmentName('C:\\shots\\a.png')).toBe('a.png');
		expect(attachmentName('dir/b.gif')).toBe('b.gif');
		expect(attachmentName('  ')).toBe('attachment');
	});
});

describe('attachmentMarkdown', () => {
	it('makes an image link, and a bare URL for a video (GitHub shows a player)', () => {
		expect(attachmentMarkdown('shot [1].png', 'https://x/a', 'image')).toBe(
			'![shot \\[1\\].png](https://x/a)'
		);
		expect(attachmentMarkdown('clip.mp4', 'https://x/b', 'video')).toBe('https://x/b');
	});
});

describe('insertBlock', () => {
	it('puts the block on its own line', () => {
		expect(insertBlock('ab', 1, 1, 'X')).toEqual({ text: 'a\nX\nb', caret: 4 });
		expect(insertBlock('', 0, 0, 'X')).toEqual({ text: 'X\n', caret: 2 });
		expect(insertBlock('a\n', 2, 2, 'X')).toEqual({ text: 'a\nX\n', caret: 4 });
	});
	it('replaces the selection', () => {
		expect(insertBlock('a sel b', 2, 5, 'X')).toEqual({ text: 'a \nX\n b', caret: 5 });
	});
});
