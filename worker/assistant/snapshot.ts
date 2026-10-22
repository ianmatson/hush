import type { CategoryGroup, ItemView } from '../../src/lib/shared/types';
import type { LegacyViewFingerprints } from '../../src/lib/shared/view-authorization';
import type { ItemsResponse } from '../../src/lib/model/present';
import type { Lifecycle } from '../workspace/work';

export interface SnapshotPrincipal {
	userId: number;
	login: string;
}

export interface SnapshotStatus {
	lifecycle: Lifecycle;
	lastPollAt: number | null;
}

export interface SavedViewsSnapshot {
	principal: SnapshotPrincipal;
	accessVersion: string;
	legacyViewFingerprints?: LegacyViewFingerprints;
	views: ItemView[];
	categoryGroups: CategoryGroup[];
	items: ItemsResponse;
	status: SnapshotStatus;
}

export class SnapshotUnavailable extends Error {
	constructor(public readonly code: 'scope_mismatch' | 'schema_not_ready') {
		super(code);
	}
}
