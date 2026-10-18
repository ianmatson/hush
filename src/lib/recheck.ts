import { api } from '$lib/api';
import { keys, refetchUnlessLive } from '$lib/queries';
import { parseGitHubItemUrl } from '$lib/shared/item-page';
import { subjectKey } from '$lib/shared/subject';

/**
 * "Did it work?" You open a PR or issue on GitHub from Hush (to review, reply, fix CI…). When you
 * come back to the tab, Hush checks those items at once, so an approved PR shows its new state
 * now and not at the next 15-minute check.
 */
const opened = new Map<string, { repo: string; number: number; at: number }>();
const MAX_PER_RETURN = 5;
/** A tab switch shorter than this is not a round trip to GitHub. */
const MIN_AWAY_MS = 2000;

/** Remember a github.com PR or issue URL. Other URLs (workflow runs, releases) are ignored. */
export function noteOpened(url: string) {
	const item = parseGitHubItemUrl(url);
	if (item)
		opened.set(subjectKey(item.repo, item.number), {
			repo: item.repo,
			number: item.number,
			at: Date.now()
		});
}

export function openOnGitHub(url: string) {
	window.open(url, '_blank', 'noopener');
	noteOpened(url);
}

async function checkReturned() {
	if (document.visibilityState !== 'visible' || !opened.size) return;
	const due = [...opened.entries()].filter(([, o]) => Date.now() - o.at > MIN_AWAY_MS);
	if (!due.length) return;
	for (const [key] of due) opened.delete(key);
	await Promise.all(
		due.slice(-MAX_PER_RETURN).map(([, o]) => api.recheck(o.repo, o.number).catch(() => null))
	);
	await refetchUnlessLive(keys.dashAll);
}

/** Start listening; returns the cleanup. Call once, from the app shell. */
export function watchReturns() {
	const run = () => void checkReturned();
	document.addEventListener('visibilitychange', run);
	window.addEventListener('focus', run);
	return () => {
		document.removeEventListener('visibilitychange', run);
		window.removeEventListener('focus', run);
	};
}
