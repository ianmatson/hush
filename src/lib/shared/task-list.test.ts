import { describe, expect, it } from 'vitest';
import { onlyThisTaskChanged, renderedTaskStates, textFingerprint, toggleTask } from './task-list';

const toggled = (markdown: string, index: number, count: number, checked: boolean) => {
	const result = toggleTask(markdown, { index, count, checked });
	if (!result.ok) throw new Error(result.reason);
	return result.body;
};

describe('toggleTask', () => {
	it('checks and unchecks the task at the index', () => {
		const body = '- [ ] one\n- [x] two\n- [ ] three';
		expect(toggled(body, 2, 3, true)).toBe('- [ ] one\n- [x] two\n- [x] three');
		expect(toggled(body, 1, 3, false)).toBe('- [ ] one\n- [ ] two\n- [ ] three');
	});

	it('reads every list marker, nesting, and quotes', () => {
		const body = [
			'* [ ] star',
			'+ [X] plus',
			'1. [ ] number',
			'2) [ ] paren',
			'  - [ ] nested',
			'> - [ ] quoted'
		].join('\n');
		expect(toggled(body, 1, 6, false)).toContain('+ [ ] plus');
		expect(toggled(body, 4, 6, true)).toContain('  - [x] nested');
		expect(toggled(body, 5, 6, true)).toContain('> - [x] quoted');
	});

	it('keeps Windows line endings', () => {
		expect(toggled('- [ ] one\r\n- [ ] two\r\n', 1, 2, true)).toBe('- [ ] one\r\n- [x] two\r\n');
	});

	it('skips tasks in code fences', () => {
		const body = [
			'```md',
			'- [ ] code',
			'```',
			'~~~~',
			'- [ ] tilde',
			'~~~',
			'~~~~',
			'- [ ] real'
		].join('\n');
		expect(toggled(body, 0, 1, true)).toContain('- [x] real');
		expect(toggled(body, 0, 1, true)).toContain('- [ ] code');
	});

	it('skips tasks in HTML comments', () => {
		const body = [
			'<!-- - [ ] inline comment -->',
			'<!--',
			'- [ ] in a comment',
			'-->',
			'- [ ] real <!-- note -->'
		].join('\n');
		expect(toggled(body, 0, 1, true)).toContain('- [x] real <!-- note -->');
	});

	it('does not read a comment start inside inline code', () => {
		const body = '- [ ] first `<!--`\n- [ ] second';
		expect(toggled(body, 1, 2, true)).toBe('- [ ] first `<!--`\n- [x] second');
	});

	it('needs a space after the box', () => {
		expect(toggleTask('- [ ]\n- [x]link', { index: 0, count: 0, checked: true })).toEqual({
			ok: false,
			reason: 'mismatch'
		});
	});

	it('refuses when the count of checkboxes differs from the rendered page', () => {
		expect(toggleTask('- [ ] one', { index: 0, count: 2, checked: true })).toEqual({
			ok: false,
			reason: 'mismatch'
		});
	});

	it('refuses when the task already has the new state', () => {
		expect(toggleTask('- [x] one', { index: 0, count: 1, checked: true })).toEqual({
			ok: false,
			reason: 'changed'
		});
	});
});

describe('renderedTaskStates', () => {
	it("reads GitHub's task checkboxes in order and ignores other inputs", () => {
		const html = [
			'<input type="checkbox" id="" disabled="" class="task-list-item-checkbox" aria-label="Completed task" checked="">',
			'<input type="checkbox" class="other">',
			'<input type="checkbox" id="" disabled="" class="task-list-item-checkbox" aria-label="Incomplete task">'
		].join('');
		expect(renderedTaskStates(html)).toEqual([true, false]);
	});
});

describe('onlyThisTaskChanged', () => {
	const toggle = { index: 1, count: 3, checked: true };

	it('accepts a render where only the clicked box changed', () => {
		expect(onlyThisTaskChanged([false, false, true], [false, true, true], toggle)).toBe(true);
	});

	it.each([
		['another box changed', [true, false, true]],
		['nothing changed', [false, false, true]],
		['two boxes changed', [true, true, true]],
		['a box went missing', [false, true]]
	])('refuses when %s', (_case, after) => {
		expect(onlyThisTaskChanged([false, false, true], after, toggle)).toBe(false);
	});
});

describe('textFingerprint', () => {
	it('is the same for the same text and differs after a change', async () => {
		expect(await textFingerprint('- [ ] a')).toBe(await textFingerprint('- [ ] a'));
		expect(await textFingerprint('- [ ] a')).not.toBe(await textFingerprint('- [ ] b'));
	});
});
