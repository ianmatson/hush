const RANDOM_ID_CHARS = 6;

export function moveItem<T>(list: readonly T[], index: number, by: number): T[] {
	const moved = [...list];
	const [item] = moved.splice(index, 1);
	moved.splice(index + by, 0, item);
	return moved;
}

export const randomId = (prefix: string) =>
	`${prefix}-${Math.random()
		.toString(36)
		.slice(2, 2 + RANDOM_ID_CHARS)}`;

export function unusedName(base: string, taken: readonly string[], firstNumber?: number): string {
	const used = new Set(taken.map((name) => name.trim().toLowerCase()));
	const nameFor = (n: number) => (firstNumber === undefined && n === 1 ? base : `${base} ${n}`);
	let n = firstNumber ?? 1;
	while (used.has(nameFor(n).toLowerCase())) n++;
	return nameFor(n);
}
