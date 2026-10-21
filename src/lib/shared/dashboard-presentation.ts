import { changesSince, type Snapshot } from './changes';
import { stillKept } from './closed-items';
import { isUnread, markState, type ItemMark } from './item-snooze';
import type { SubjectFacts } from './subject';
import type { DashResponse } from './types';

export interface SeenItem {
	at: number;
	snapshot: Snapshot;
}

export function presentDashboard(
	data: DashResponse,
	me: string,
	facts: Map<string, SubjectFacts>,
	marks: Map<string, ItemMark>,
	seen: Map<string, SeenItem>,
	now: number
): DashResponse {
	const items = data.items
		.filter((item) => !item.keptAfterClose || stillKept(item, now))
		.map(({ sourceFilters: _filters, sourceQueries: _queries, ...item }) => {
			const subject = facts.get(item.id);
			const state = markState(marks.get(item.id), item.updatedAt, subject, me, now);
			const previous = seen.get(item.id);
			const changes = previous && subject ? changesSince(previous.snapshot, subject, me) : [];
			const seenAt = previous && subject ? previous.at : null;
			return {
				...item,
				dismissed: state.kind !== 'none',
				muted: state.kind === 'muted',
				snooze: state.kind === 'snoozed' ? state.snooze : undefined,
				changes,
				seenAt,
				unread: isUnread(seenAt, changes)
			};
		});
	const {
		sourceItems: _sourceItems,
		projectErrors: _projectErrors,
		sourceFailures: _sourceFailures,
		...visible
	} = data;
	return { ...visible, items };
}
