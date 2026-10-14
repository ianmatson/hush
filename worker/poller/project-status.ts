import type { DashItem, DashResponse, DashSourceItem } from '../../src/lib/shared/types';
import type { ItemStatuses } from '../projects';

export function withProjectStatuses(
	items: DashItem[],
	nodeIdOf: (key: string) => string | undefined,
	statuses: ItemStatuses | null,
	previous: {
		items: Pick<DashSourceItem, 'id' | 'projectStatus' | 'projectStatusUnknown'>[];
		projects?: DashResponse['projects'];
	} = { items: [] },
	full = false
): Pick<DashResponse, 'items' | 'projects'> {
	if (!statuses)
		return {
			items: items.map(
				({ projectStatus: _projectStatus, projectStatusUnknown: _unknown, ...item }) => item
			)
		};
	const previousById = new Map(previous.items.map((item) => [item.id, item]));
	const projects = new Map((previous.projects ?? []).map((project) => [project.key, project]));
	for (const project of statuses.projects) projects.set(project.key, project);
	const updated = items.map((item) => {
		const nodeId = nodeIdOf(item.id);
		const previousStatus = previousById.get(item.id)?.projectStatus;
		const freshStatus = nodeId ? statuses.statusOf.get(nodeId) : undefined;
		const projectStatus = freshStatus ?? previousStatus;
		return {
			...item,
			projectStatus,
			projectStatusUnknown:
				freshStatus === undefined
					? previousById.get(item.id)?.projectStatusUnknown || projectStatus === undefined
					: false
		};
	});
	const used = new Set(updated.flatMap((item) => Object.keys(item.projectStatus ?? {})));
	return {
		items: updated,
		projects: [...projects.values()].filter((project) => !full || used.has(project.key))
	};
}

export function sourceItemOf(item: DashItem): DashSourceItem {
	const {
		id,
		updatedAt,
		sections,
		sourceFilters,
		sourceQueries,
		keptAfterClose,
		keptSections,
		projectStatus,
		projectStatusUnknown
	} = item;
	return {
		id,
		updatedAt,
		sections,
		sourceFilters,
		sourceQueries,
		keptAfterClose,
		keptSections,
		projectStatus,
		projectStatusUnknown
	};
}
