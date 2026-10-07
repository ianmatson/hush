export function keepHeldRow<T extends { id: string }>(
	rows: T[],
	shownBefore: T[],
	heldId: string | null
): T[] {
	if (heldId === null || rows.some((r) => r.id === heldId)) return rows;
	const heldAt = shownBefore.findIndex((r) => r.id === heldId);
	if (heldAt < 0) return rows;
	const listedNow = new Set(rows.map((r) => r.id));
	const insertAt = shownBefore.slice(0, heldAt).filter((r) => listedNow.has(r.id)).length;
	return [...rows.slice(0, insertAt), shownBefore[heldAt], ...rows.slice(insertAt)];
}
