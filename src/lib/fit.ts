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
