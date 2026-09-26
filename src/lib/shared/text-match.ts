/** Split on spaces, keeping quoted parts ("a b") together. Quotes are removed. */
export function tokens(s: string): string[] {
	const out: string[] = [];
	for (const m of s.matchAll(/(?:[^\s"]+|"[^"]*"?)+/g)) out.push(m[0].replace(/"/g, ''));
	return out.filter(Boolean);
}

/** The `text` condition: every word must be in one of the fields (not case-sensitive). */
export function textMatches(text: string | undefined, fields: (string | null | undefined)[]) {
	if (!text) return true;
	const hay = fields.filter(Boolean).join(' ').toLowerCase();
	return tokens(text.toLowerCase()).every((w) => hay.includes(w));
}
