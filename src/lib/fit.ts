export interface FitOptions {
	gap: number;
	moreWidth: number;
	reserved?: number;
	keep?: number;
}

export function fitItems(widths: number[], room: number, options: FitOptions): number[] {
	const { gap, moreWidth, reserved = 0, keep = -1 } = options;
	const all = widths.map((_, k) => k);
	const total = widths.reduce((sum, w) => sum + w + gap, reserved);
	if (total <= room) return all;
	const space = room - reserved - moreWidth;
	const shown: number[] = [];
	let used = 0;
	for (const k of all) {
		if (used + widths[k] + gap > space) break;
		used += widths[k] + gap;
		shown.push(k);
	}
	if (keep >= 0 && keep < widths.length && !shown.includes(keep)) {
		while (shown.length && used + widths[keep] + gap > space) used -= widths[shown.pop()!] + gap;
		shown.push(keep);
	}
	return shown;
}

export function fitWithTrailingControl(
	widths: number[],
	room: number,
	{ gap, moreWidth, controlWidth }: { gap: number; moreWidth: number; controlWidth: number }
): number {
	const total = widths.reduce((sum, w) => sum + w + gap, controlWidth);
	if (total <= room) return widths.length;
	const space = room - moreWidth;
	let used = 0;
	let shown = 0;
	while (shown < widths.length - 1 && used + widths[shown] + gap <= space) {
		used += widths[shown] + gap;
		shown++;
	}
	return shown;
}
