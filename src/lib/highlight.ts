import type { HighlighterCore } from 'shiki/core';
import { hunkSides, type DiffHunk } from '$lib/shared/diff';

export interface HighlightedToken {
	content: string;
	color: string | undefined;
	italic: boolean;
}

const THEME = 'hush';
const ITALIC_FONT_STYLE = 1;
const MAX_HIGHLIGHTED_LINE_LENGTH = 1000;

let highlighter: Promise<HighlighterCore> | null = null;
const loadedLanguages = new Map<string, Promise<boolean>>();

function getHighlighter(): Promise<HighlighterCore> {
	highlighter ??= Promise.all([import('shiki/core'), import('shiki/engine/javascript')]).then(
		([{ createHighlighterCore, createCssVariablesTheme }, { createJavaScriptRegexEngine }]) =>
			createHighlighterCore({
				themes: [createCssVariablesTheme({ name: THEME, variablePrefix: '--shiki-' })],
				langs: [],
				engine: createJavaScriptRegexEngine({ forgiving: true })
			})
	);
	return highlighter;
}

function loadLanguage(core: HighlighterCore, language: string): Promise<boolean> {
	let loading = loadedLanguages.get(language);
	if (!loading) {
		loading = import('shiki/langs')
			.then(({ bundledLanguages }) => {
				const grammar = bundledLanguages[language as keyof typeof bundledLanguages];
				return grammar ? core.loadLanguage(grammar).then(() => true) : false;
			})
			.catch(() => false);
		loadedLanguages.set(language, loading);
	}
	return loading;
}

function tokenize(core: HighlighterCore, text: string, language: string) {
	return core.codeToTokensBase(text, { lang: language, theme: THEME }).map((line) =>
		line.map((token): HighlightedToken => ({
			content: token.content,
			color: token.color,
			italic: ((token.fontStyle ?? 0) & ITALIC_FONT_STYLE) !== 0
		}))
	);
}

export async function highlightHunks(
	hunks: DiffHunk[],
	language: string
): Promise<HighlightedToken[][][] | null> {
	const tooLong = hunks.some((h) =>
		h.lines.some((l) => l.text.length > MAX_HIGHLIGHTED_LINE_LENGTH)
	);
	if (tooLong) return null;
	const core = await getHighlighter();
	if (!(await loadLanguage(core, language))) return null;
	return hunks.map((hunk) => {
		const sides = hunkSides(hunk);
		const oldTokens = tokenize(core, sides.oldText, language);
		const newTokens = tokenize(core, sides.newText, language);
		return sides.sideLine.map(({ side, index }) =>
			index < 0 ? [] : ((side === 'old' ? oldTokens : newTokens)[index] ?? [])
		);
	});
}
