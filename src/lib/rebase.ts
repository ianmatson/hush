type Plain = Record<string, unknown>;
type Identified = { id: string };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isPlain = (value: unknown): value is Plain =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
const isIdList = (value: unknown): value is Identified[] =>
	Array.isArray(value) && value.every((x) => isPlain(x) && typeof x.id === 'string');

export function rebaseEditsOntoCurrent<T>(base: T, edited: T, current: T): T {
	if (same(edited, base)) return current;
	if (isIdList(base) && isIdList(edited) && isIdList(current))
		return rebaseIdList(base, edited, current) as T;
	if (isPlain(base) && isPlain(edited) && isPlain(current))
		return rebaseObject(base, edited, current) as T;
	return edited;
}

function rebaseObject(base: Plain, edited: Plain, current: Plain): Plain {
	const merged: Plain = {};
	for (const key of new Set([...Object.keys(current), ...Object.keys(edited)])) {
		const removedHere = key in base && !(key in edited);
		if (removedHere) continue;
		const onlyHere = !(key in base) || !(key in current);
		merged[key] = onlyHere
			? edited[key]
			: rebaseEditsOntoCurrent(base[key], edited[key], current[key]);
	}
	return merged;
}

function rebaseIdList(base: Identified[], edited: Identified[], current: Identified[]) {
	const baseById = new Map(base.map((x) => [x.id, x]));
	const editedIds = new Set(edited.map((x) => x.id));
	const currentById = new Map(current.map((x) => [x.id, x]));
	const changedHere = (x: Identified) => !same(baseById.get(x.id), x);
	const mergedOf = (x: Identified) => {
		const was = baseById.get(x.id);
		const now = currentById.get(x.id);
		return was && now ? rebaseEditsOntoCurrent(was, x, now) : x;
	};
	const keptHere = edited.filter((x) => currentById.has(x.id) || changedHere(x)).map(mergedOf);
	const addedElsewhere = current.filter((x) => !baseById.has(x.id) && !editedIds.has(x.id));
	const idsInBoth = (from: Identified[], to: Identified[]) =>
		from.map((x) => x.id).filter((id) => to.some((y) => y.id === id));
	const reorderedHere = !same(idsInBoth(base, edited), idsInBoth(edited, base));
	if (reorderedHere) return [...keptHere, ...addedElsewhere];

	const keptById = new Map(keptHere.map((x) => [x.id, x]));
	const inCurrentOrder = current.flatMap((x) => {
		if (editedIds.has(x.id)) return [keptById.get(x.id)!];
		const removedHere = baseById.has(x.id);
		return removedHere ? [] : [x];
	});
	const notInCurrent = keptHere.filter((x) => !currentById.has(x.id));
	return [...inCurrentOrder, ...notInCurrent];
}
