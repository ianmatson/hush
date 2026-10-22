import type { CategoryGroup, ItemView } from '../../src/lib/shared/types';
import type { LegacyViewFingerprints } from '../../src/lib/shared/view-authorization';
import type { ItemsResponse } from '../../src/lib/model/present';

export interface SnapshotPrincipal {
	userId: number;
	login: string;
}

export interface SavedViewsSnapshot {
	principal: SnapshotPrincipal;
	accessVersion: string;
	legacyViewFingerprints?: LegacyViewFingerprints;
	views: ItemView[];
	categoryGroups: CategoryGroup[];
	items: ItemsResponse;
}

export class SnapshotUnavailable extends Error {
	constructor(public readonly code: 'scope_mismatch' | 'schema_not_ready') {
		super(code);
	}
}
