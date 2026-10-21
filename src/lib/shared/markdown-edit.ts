export type TextRange = { start: number; end: number };
export type TextChange = TextRange & { replacement: string };

export function markdownLink(selected: string, pasted: string): string | null {
	const url = pasted.trim();
	if (!selected.trim() || !/^https?:\/\//i.test(url) || /\s/.test(url)) return null;
	try {
		new URL(url);
	} catch {
		return null;
	}
	const label = selected.replace(/[\\[\]]/g, '\\$&');
	const destination = url.replace(
		/[\\()<>]/g,
		(character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
	);
	return `[${label}](${destination})`;
}

export function textChange(before: string, after: string): TextChange {
	let start = 0;
	while (start < before.length && start < after.length && before[start] === after[start]) start++;
	let end = before.length;
	let nextEnd = after.length;
	while (end > start && nextEnd > start && before[end - 1] === after[nextEnd - 1]) {
		end--;
		nextEnd--;
	}
	return { start, end, replacement: after.slice(start, nextEnd) };
}

export function moveTextRange(range: TextRange, change: TextChange): TextRange {
	if (change.end <= range.start) {
		const shift = change.replacement.length - (change.end - change.start);
		return { start: range.start + shift, end: range.end + shift };
	}
	if (change.start >= range.end) return range;
	const caret = change.start + change.replacement.length;
	return { start: caret, end: caret };
}
