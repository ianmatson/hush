const QUOTE_AND_INDENT = /^(?:[ \t]*>)*[ \t]*/;
const FENCE = /^(`{3,}|~{3,})/;
const TASK = /^((?:[ \t]*>)*[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+\[)([ xX])(\][ \t])/;
const COMMENT_OPEN = '<!--';
const COMMENT_CLOSE = '-->';
const CODE_SPAN = /(`+)[^`]*?\1/g;
const RENDERED_CHECKBOX = /<input\b[^>]*\btask-list-item-checkbox\b[^>]*>/g;
const CHECKED_ATTRIBUTE = /\schecked\b/;

export interface TaskToggle {
	index: number;
	count: number;
	checked: boolean;
}

export type TaskToggleResult =
	{ ok: true; body: string } | { ok: false; reason: 'mismatch' | 'changed' };

interface TaskLine {
	line: number;
	checked: boolean;
}

function endsComment(line: string, from: number): number {
	const close = line.indexOf(COMMENT_CLOSE, from);
	return close === -1 ? -1 : close + COMMENT_CLOSE.length;
}

function staysInComment(line: string, inComment: boolean): boolean {
	let at = 0;
	let open = inComment;
	while (at <= line.length) {
		if (open) {
			const end = endsComment(line, at);
			if (end === -1) return true;
			open = false;
			at = end;
		} else {
			const start = line.indexOf(COMMENT_OPEN, at);
			if (start === -1) return false;
			open = true;
			at = start + COMMENT_OPEN.length;
		}
	}
	return open;
}

function tasksIn(lines: string[]): TaskLine[] {
	const tasks: TaskLine[] = [];
	let fence: { char: string; length: number } | null = null;
	let inComment = false;
	lines.forEach((line, index) => {
		const content = line.replace(QUOTE_AND_INDENT, '');
		const fenceMark = FENCE.exec(content)?.[1];
		if (fence) {
			const closes =
				!!fenceMark &&
				fenceMark[0] === fence.char &&
				fenceMark.length >= fence.length &&
				!content.slice(fenceMark.length).trim();
			if (closes) fence = null;
			return;
		}
		if (!inComment && fenceMark) {
			fence = { char: fenceMark[0], length: fenceMark.length };
			return;
		}
		const startsInComment = inComment;
		inComment = staysInComment(line.replace(CODE_SPAN, ''), inComment);
		if (startsInComment || line.trimStart().startsWith(COMMENT_OPEN)) return;
		const task = TASK.exec(line);
		if (task) tasks.push({ line: index, checked: task[2] !== ' ' });
	});
	return tasks;
}

export function toggleTask(markdown: string, toggle: TaskToggle): TaskToggleResult {
	const lines = markdown.split('\n');
	const tasks = tasksIn(lines);
	if (tasks.length !== toggle.count) return { ok: false, reason: 'mismatch' };
	const task = tasks[toggle.index];
	if (!task) return { ok: false, reason: 'mismatch' };
	if (task.checked === toggle.checked) return { ok: false, reason: 'changed' };
	lines[task.line] = lines[task.line].replace(
		TASK,
		(_, before: string, _mark: string, after: string) =>
			`${before}${toggle.checked ? 'x' : ' '}${after}`
	);
	return { ok: true, body: lines.join('\n') };
}

export function renderedTaskStates(html: string): boolean[] {
	return [...html.matchAll(RENDERED_CHECKBOX)].map(([input]) => CHECKED_ATTRIBUTE.test(input));
}

export function onlyThisTaskChanged(
	before: boolean[],
	after: boolean[],
	toggle: TaskToggle
): boolean {
	return (
		before.length === toggle.count &&
		after.length === toggle.count &&
		before[toggle.index] !== toggle.checked &&
		after.every((checked, i) => checked === (i === toggle.index ? toggle.checked : before[i]))
	);
}

export async function textFingerprint(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
