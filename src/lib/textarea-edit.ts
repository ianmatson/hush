import type { Attachment } from 'svelte/attachments';
import type { TextEdit } from '$lib/shared/attachments';
import { markdownLink, moveTextRange, textChange } from '$lib/shared/markdown-edit';

export function applyTextareaEdit(box: HTMLTextAreaElement, edit: TextEdit) {
	if (box.value === edit.text) return;
	const change = textChange(box.value, edit.text);
	const previouslyFocused = box.ownerDocument.activeElement;
	box.focus({ preventScroll: true });
	box.setSelectionRange(change.start, change.end);
	const inserted = box.ownerDocument.execCommand('insertText', false, change.replacement);
	if (!inserted) box.setRangeText(change.replacement, change.start, change.end, 'end');
	box.setSelectionRange(edit.caret, edit.caret);
	box.dispatchEvent(new Event('input', { bubbles: true }));
	if (previouslyFocused instanceof HTMLElement && previouslyFocused !== box) {
		previouslyFocused.focus({ preventScroll: true });
	}
}

export function trackTextareaSelection(box: HTMLTextAreaElement) {
	let range = { start: box.selectionStart, end: box.selectionEnd };
	let text = box.value;
	const update = () => {
		range = moveTextRange(range, textChange(text, box.value));
		text = box.value;
	};
	box.addEventListener('input', update);
	return {
		get range() {
			return range;
		},
		destroy: () => box.removeEventListener('input', update)
	};
}

export const markdownEditor: Attachment<HTMLTextAreaElement> = (box) => {
	const paste = (event: ClipboardEvent) => {
		if (event.defaultPrevented || box.disabled || box.readOnly) return;
		const { selectionStart: start, selectionEnd: end } = box;
		const replacement = markdownLink(
			box.value.slice(start, end),
			event.clipboardData?.getData('text/plain') ?? ''
		);
		if (!replacement) return;
		const text = box.value.slice(0, start) + replacement + box.value.slice(end);
		if (box.maxLength >= 0 && text.length > box.maxLength) return;
		event.preventDefault();
		applyTextareaEdit(box, { text, caret: start + replacement.length });
	};
	box.addEventListener('paste', paste);
	return () => box.removeEventListener('paste', paste);
};
