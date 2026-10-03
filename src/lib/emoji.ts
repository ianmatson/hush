import type { EmojiEntry } from '$lib/shared/suggest';

let emojiList: Promise<EmojiEntry[]> | null = null;

export function loadEmojiList(): Promise<EmojiEntry[]> {
	emojiList ??= import('gemoji').then((m) => m.gemoji);
	return emojiList;
}
