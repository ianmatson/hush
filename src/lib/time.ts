const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'narrow' });

export function ago(iso: string | number): string {
	const t = typeof iso === 'number' ? iso : Date.parse(iso);
	const s = Math.round((t - Date.now()) / 1000);
	const abs = Math.abs(s);
	if (abs < 45) return 'now';
	if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
	if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
	if (abs < 86400 * 7) return rtf.format(Math.round(s / 86400), 'day');
	return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Snooze presets, as absolute timestamps. */
export function snoozeOptions(now = new Date()): { label: string; until: number }[] {
	const at = (days: number, hour: number) => {
		const d = new Date(now);
		d.setDate(d.getDate() + days);
		d.setHours(hour, 0, 0, 0);
		return d.getTime();
	};
	const nextMonday = (() => {
		const offset = (8 - now.getDay()) % 7 || 7;
		return at(offset, 9);
	})();
	return [
		{ label: '1 hour', until: now.getTime() + 3600_000 },
		{ label: '3 hours', until: now.getTime() + 3 * 3600_000 },
		{ label: 'Tomorrow 9:00', until: at(1, 9) },
		{ label: 'Next Monday 9:00', until: nextMonday }
	];
}

/** Short duration since a time, e.g. "45m", "3h", "5d", "6w", "4mo". */
export function since(iso: string | number, now = Date.now()): string {
	const t = typeof iso === 'number' ? iso : Date.parse(iso);
	const m = Math.max(0, Math.round((now - t) / 60_000));
	if (m < 60) return `${m}m`;
	const h = Math.round(m / 60);
	if (h < 24) return `${h}h`;
	const d = Math.round(h / 24);
	if (d < 14) return `${d}d`;
	if (d < 60) return `${Math.round(d / 7)}w`;
	return `${Math.round(d / 30)}mo`;
}
