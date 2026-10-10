const WORD_BREAK = /[\s/:._-]+/;
const WHOLE_START = 1;
const WORD_START = 0.75;
const INSIDE = 0.5;
const NO_MATCH = 0;

export function optionScore(value: string, search: string, keywords: string[] = []): number {
	const wanted = search.trim().toLowerCase();
	if (!wanted) return WHOLE_START;
	const texts = [...keywords, value].map((text) => text.toLowerCase());
	if (texts.some((text) => text.startsWith(wanted))) return WHOLE_START;
	if (texts.some((text) => text.split(WORD_BREAK).some((word) => word.startsWith(wanted))))
		return WORD_START;
	return texts.some((text) => text.includes(wanted)) ? INSIDE : NO_MATCH;
}
