import type { ActionKind, Enrichment } from './types';

/**
 * Why an item left Your turn by itself, in a few words ("You approved", "CI passes now"). A note names a change only when
 * that change happened; otherwise the reason is a rule (a draft is never your turn, bots are FYI).
 */
export function resolvedNote(
	kind: ActionKind,
	before: Enrichment | null,
	e: Enrichment,
	me: string
): string {
	if (e.state === 'merged') return 'Merged';
	if (e.state === 'closed') return 'Closed';
	if (e.draft && !before?.draft) return 'Converted to draft';
	const newReview = !!e.myReview && e.myReview.at !== before?.myReview?.at;
	const newCommits = !!e.lastCommitAt && e.lastCommitAt !== before?.lastCommitAt;
	const lastByMe = e.lastComment?.author.toLowerCase() === me.toLowerCase();
	const other = e.draft ? 'Draft PR' : 'No longer needs you';
	switch (kind) {
		case 'review':
			if (newReview)
				return e.myReview!.state === 'APPROVED'
					? 'You approved'
					: e.myReview!.state === 'CHANGES_REQUESTED'
						? 'You requested changes'
						: 'You reviewed';
			// "Any review": someone else's verdict settled it.
			if (e.lastVerdict && e.lastVerdict.at !== before?.lastVerdict?.at)
				return `@${e.lastVerdict.by} reviewed`;
			return e.reviewRequestedFromMe ? other : 'Review no longer requested';
		case 'fix_ci':
			if (e.ci === 'SUCCESS') return 'CI passes now';
			if (e.ci === 'PENDING' || e.ci === 'EXPECTED') return 'CI is running again';
			return e.ci === 'FAILURE' || e.ci === 'ERROR' ? other : 'CI no longer fails';
		case 'address_review':
			if (newCommits) return 'You pushed changes';
			return e.reviewDecision === 'CHANGES_REQUESTED' ? other : 'Changes no longer requested';
		case 'resolve_conflict':
			return e.mergeable === 'CONFLICTING' ? other : 'Conflicts resolved';
		case 'merge':
			return other;
		case 'reply':
			if ((before?.openThreads ?? 0) > 0 && !e.openThreads) return 'Threads resolved';
			return lastByMe ? 'You replied' : newCommits ? 'You pushed changes' : other;
		case 'triage':
			if (before?.assignedToMe && e.assignedToMe === false) return 'No longer assigned to you';
			return lastByMe ? 'You replied' : other;
		default:
			return other;
	}
}
