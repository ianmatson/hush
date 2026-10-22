import type { Snapshot } from '../shared/changes';
import type { SnoozeEvent } from '../shared/snooze';
import type { SubjectFacts } from '../shared/subject';
import type { DashItem, DashKind, ItemView } from '../shared/types';

export type ItemId = string;

export type ProjectFacet =
	| { state: 'unknown' }
	| { state: 'unavailable' }
	| { state: 'known'; statuses: Record<string, string | null>; stale: boolean };

export interface Analysis {
	version: string;
	replyInput: string | null;
	identityInput: string | null;
	reply?: number;
	urgency?: number;
	about: Record<string, number>;
	choices: Record<string, string>;
}

export type Snooze =
	| { kind: 'activity'; id: string; at: number; activityAt: string }
	| { kind: 'time'; id: string; at: number; until: number }
	| { kind: 'event'; id: string; at: number; event: SnoozeEvent; until: number };

export interface SeenBaseline {
	at: number;
	revision: number;
	snapshot: Snapshot;
}

export interface Attention {
	seen: SeenBaseline | null;
	markedUnread: boolean;
	snooze: Snooze | null;
	muted: boolean;
	pins: string[];
}

export interface Item {
	id: ItemId;
	revision: number;
	facts: SubjectFacts;
	project: ProjectFacet;
	analysis: Analysis | null;
	attention: Attention;
}

export type SourceAdapter = 'search' | 'board';

export interface SourceSpec {
	id: string;
	adapter: SourceAdapter;
	kind: DashKind;
	query: string;
}

export interface SourceCandidate {
	id: ItemId;
	updatedAt: string;
}

export interface SourceWindow {
	candidates: SourceCandidate[];
	truncated: boolean;
}

export interface Source {
	spec: SourceSpec;
	window: SourceWindow | null;
	failedSince: number | null;
	error: string | null;
}

export interface Clause {
	binding: string;
	sourceId: string;
	kind: DashKind;
	local: string;
	onBoard: boolean;
	openOnly: boolean;
	teams: string[] | null;
	orDirect: boolean;
}

export interface CompiledView {
	view: ItemView;
	scope: string;
	clauses: Clause[];
	skipped: string | null;
}

export interface ViewState {
	scope: string;
	members: ItemId[];
	retained: ItemId[];
	seededBindings: string[];
	baseline: ItemId[];
	awaitingRefresh: string[];
}

export type Row = Omit<DashItem, 'views' | 'retainedIn'>;

export interface SourceHealth {
	sourceId: string;
	stale: boolean;
	unknown: boolean;
	truncated: boolean;
	error: string | null;
}

export interface Membership {
	candidates: Set<ItemId>;
	members: Set<ItemId>;
	unsettled: Set<ItemId>;
	validBindings: Set<string>;
	acceptedBy: Map<string, Set<ItemId>>;
	health: SourceHealth[];
}
