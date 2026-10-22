import type { CategoryGroup, DashItem, ItemView } from '../../src/lib/shared/types';
import { fingerprintView } from '../../src/lib/shared/view-authorization';
import { SnapshotUnavailable, type SavedViewsSnapshot } from './snapshot';

export { fingerprintView };

export interface SavedViewGrant {
	id: string;
	userId: number;
	views: { id: string; fingerprint: string }[];
}

export const matchesViewFingerprint = async (view: ItemView, fingerprint: string) =>
	fingerprint === (await fingerprintView(view));

export async function grantedSnapshot(
	snapshot: SavedViewsSnapshot,
	grant: SavedViewGrant
): Promise<SavedViewsSnapshot> {
	if (grant.userId !== snapshot.principal.userId) throw new SnapshotUnavailable('scope_mismatch');
	const permitted = new Map(grant.views.map((view) => [view.id, view.fingerprint]));
	const views = [];
	for (const view of snapshot.views)
		if (permitted.has(view.id) && (await matchesViewFingerprint(view, permitted.get(view.id)!)))
			views.push(view);
	return { ...snapshot, views };
}

export function categoriesOfView(view: ItemView, groups: CategoryGroup[]): CategoryGroup[] {
	return groups.filter((group) => view.groupBy === `category:${group.id}`);
}

export function itemInView(
	item: DashItem,
	view: ItemView,
	groups: CategoryGroup[],
	population: DashItem[]
): DashItem {
	const categories = new Set(
		groups.flatMap((group) => group.categories.map((category) => category.id))
	);
	const project = view.groupBy.startsWith('project:')
		? view.groupBy.slice('project:'.length)
		: null;
	const allowedLinks = new Map(population.map((member) => [member.url, member]));
	return {
		id: item.id,
		itemId: item.itemId,
		revision: item.revision,
		baseline: item.baseline,
		analysisStale: item.analysisStale,
		retained: item.retained,
		views: item.views.filter((id) => id === view.id),
		retainedIn: item.retainedIn.filter((id) => id === view.id),
		kind: item.kind,
		number: item.number,
		title: item.title,
		body: item.body,
		url: item.url,
		repo: item.repo,
		author: item.author,
		authorAvatar: item.authorAvatar,
		authorIsBot: item.authorIsBot,
		authorAssociation: item.authorAssociation,
		createdAt: item.createdAt,
		updatedAt: item.updatedAt,
		state: item.state,
		closedAt: item.closedAt,
		closeReason: item.closeReason,
		draft: item.draft,
		labels: item.labels.map(({ name, color }) => ({ name, color })),
		comments: item.comments,
		lastHumanCommentBy: item.lastHumanCommentBy,
		lastHumanCommentAt: item.lastHumanCommentAt,
		activity: item.activity
			? {
					by: item.activity.by,
					bot: item.activity.bot,
					what: item.activity.what,
					at: item.activity.at
				}
			: null,
		assignees: [...item.assignees],
		reviewRequests: [...item.reviewRequests],
		ci: item.ci,
		reviewDecision: item.reviewDecision,
		mergeable: item.mergeable,
		additions: item.additions,
		deletions: item.deletions,
		requestedMe: item.requestedMe,
		requestedTeams: [...item.requestedTeams],
		requestedAt: item.requestedAt,
		reviewRequestCount: item.reviewRequestCount,
		reviewed: item.reviewed,
		myLastReviewAt: item.myLastReviewAt,
		openThreads: item.openThreads,
		stackBelowNearestFirst: item.stackBelowNearestFirst?.flatMap((link) => {
			const member = allowedLinks.get(link.url);
			return member
				? [
						{
							number: member.number,
							title: member.title,
							url: member.url,
							author: member.author,
							draft: member.draft
						}
					]
				: [];
		}),
		myLastReviewState: item.myLastReviewState,
		lastCommitAt: item.lastCommitAt,
		commentsNeedMe: item.commentsNeedMe,
		urgent: item.urgent,
		categories: item.categories?.filter((id) => categories.has(id)),
		pinnedCategories: item.pinnedCategories?.filter((id) => categories.has(id)),
		turn: item.turn,
		turnReason: item.turnReason,
		waitingSince: item.waitingSince,
		stale: item.stale,
		actionLabel: item.actionLabel,
		actionUrl: item.actionUrl,
		priority: item.priority,
		dismissed: item.dismissed,
		muted: item.muted,
		changes: item.changes?.map(({ kind, text, tone, labels }) => ({
			kind,
			text,
			tone,
			labels: labels ? [...labels] : undefined
		})),
		seenAt: item.seenAt,
		unread: item.unread,
		projectStatus:
			project && item.projectStatus && Object.hasOwn(item.projectStatus, project)
				? { [project]: item.projectStatus[project] }
				: undefined,
		projectStatusUnknown: project ? item.projectStatusUnknown : undefined
	};
}
