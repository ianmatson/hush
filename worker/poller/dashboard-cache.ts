import { sectionsFor } from '../../src/lib/shared/item-views';
import type { DashKind, DashResponse, Settings } from '../../src/lib/shared/types';

export type CachedDash = { sig: string; data: DashResponse };

export function dashSignature(kind: DashKind, settings: Settings): string {
	const { dash, views } = settings;
	return JSON.stringify([
		sectionsFor(kind, views),
		dash.excludedTeams,
		dash.staleDays,
		dash.hideOthersDrafts,
		dash.hideBots
	]);
}

export function matchesDashSignature(
	signature: string,
	kind: DashKind,
	settings: Settings
): boolean {
	const sourceScope = (value: string) => {
		const [sections, ...scope] = JSON.parse(value);
		return JSON.stringify([
			sections
				.map(({ name: _name, ...section }: { name: string }) => section)
				.sort((a: object, b: object) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
			...scope
		]);
	};
	try {
		return sourceScope(signature) === sourceScope(dashSignature(kind, settings));
	} catch {
		return false;
	}
}
