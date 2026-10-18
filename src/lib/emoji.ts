import { tick } from 'svelte';
import {
	closedShortcodeBefore,
	emojiForShortcode,
	replaceWithEmoji,
	type EmojiEntry
} from '$lib/shared/suggest';

let emojiList: Promise<EmojiEntry[]> | null = null;

export function loadEmojiList(): Promise<EmojiEntry[]> {
	emojiList ??= import('gemoji').then((m) => m.gemoji);
	return emojiList;
}

export async function expandClosedShortcode(
	box: HTMLTextAreaElement | null,
	readText: () => string,
	writeText: (text: string) => void
) {
	if (!box || box.selectionStart !== box.selectionEnd) return;
	const caret = box.selectionStart;
	const typed = readText();
	const closed = closedShortcodeBefore(typed, caret);
	if (!closed) return;
	const emoji = emojiForShortcode(await loadEmojiList(), closed.shortcode);
	if (!emoji || readText() !== typed) return;
	const r = replaceWithEmoji(typed, caret, closed.start, emoji);
	writeText(r.text);
	await tick();
	box.setSelectionRange(r.caret, r.caret);
}
