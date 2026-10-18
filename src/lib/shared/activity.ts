import { isBot } from './bots';
import { sameLogin } from './logins';
import type { Enrichment, LastComment, LatestReview } from './types';

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

type RecentComments = Pick<Enrichment, 'lastComment' | 'previousComment'>;

export const isAfter = (
	iso: string | null | undefined,
	than: string | number | null | undefined
): boolean =>
	!!iso && (than == null || Date.parse(iso) > (typeof than === 'number' ? than : Date.parse(than)));

export const newestHumanComment = (s: RecentComments): LastComment | null =>
	[s.lastComment, s.previousComment].find((c) => !!c && !c.authorIsBot) ?? null;

export function replyFromOthers(
	s: RecentComments,
	me: string,
	since?: string | number | null
): LastComment | null {
	const reply = newestHumanComment(s);
	return reply && !sameLogin(reply.author, me) && isAfter(reply.createdAt, since) ? reply : null;
}

const reviewByBot = (r: LatestReview) => r.authorIsBot ?? isBot(r.author);

export function reviewFromOthers(
	r: LatestReview | null | undefined,
	me: string,
	since?: string | number | null
): LatestReview | null {
	return r && !reviewByBot(r) && !sameLogin(r.author, me) && isAfter(r.at, since) ? r : null;
}

export function latestActivity(
	e: Pick<Enrichment, 'lastComment' | 'latestReview' | 'lastCommitAt'> | null | undefined
): Activity | null {
	if (!e) return null;
	const found: Activity[] = [];
	const c = e.lastComment;
	if (c?.createdAt)
		found.push({ by: c.author, bot: c.authorIsBot, what: 'commented', at: c.createdAt });
	const r = e.latestReview;
	if (r?.at)
		found.push({
			by: r.author,
			bot: reviewByBot(r),
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
