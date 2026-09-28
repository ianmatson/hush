import { isBot } from './bots';
import type { Enrichment } from './types';

/**
 * The newest thing that happened on a PR or issue, from the facts Hush stores: a comment, a
 * review, or a push. It says who did it (GitHub does not say who pushed commits) and whether a
 * bot did it. The notification itself only says why you get it ("you opened this").
 */
export interface Activity {
	/** GitHub login; null for commits. */
	by: string | null;
	bot: boolean;
	what: 'commented' | 'approved' | 'requested changes' | 'reviewed' | 'pushed';
	at: string;
}

export function latestActivity(
	e: Pick<Enrichment, 'lastComment' | 'latestReview' | 'lastCommitAt'> | null | undefined
): Activity | null {
	if (!e) return null;
	const found: Activity[] = [];
	const c = e.lastComment;
	if (c?.createdAt)
		found.push({
			by: c.author,
			bot: c.authorIsBot || isBot(c.author),
			what: 'commented',
			at: c.createdAt
		});
	const r = e.latestReview;
	if (r?.at)
		found.push({
			by: r.author,
			bot: isBot(r.author),
			what:
				r.state === 'APPROVED'
					? 'approved'
					: r.state === 'CHANGES_REQUESTED'
						? 'requested changes'
						: 'reviewed',
			at: r.at
		});
	if (e.lastCommitAt) found.push({ by: null, bot: false, what: 'pushed', at: e.lastCommitAt });
	return found.sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
}

/** "@alice commented on your PR", "New commits on this PR", "You approved this PR". */
export function activityText(a: Activity, me: string, subject: string): string {
	if (a.what === 'pushed') return `New commits on ${subject}`;
	const who = a.by?.toLowerCase() === me.toLowerCase() ? 'You' : `@${a.by}`;
	if (a.what === 'commented') return `${who} commented on ${subject}`;
	return `${who} ${a.what} ${subject}`;
}
