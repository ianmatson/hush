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
