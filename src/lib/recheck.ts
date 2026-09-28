import { toast } from 'svelte-sonner';
import { api } from '$lib/api';
import { keys, queryClient } from '$lib/queries';

/**
 * "Did it work?" You open a PR or issue on GitHub from Hush (to review, reply, fix CI…). When you
 * come back to the tab, Hush checks those items at once, so an approved PR leaves "Needs you"
 * now and not at the next 15-minute check.
 */
const opened = new Map<string, { repo: string; number: number; at: number }>();
const MAX_PER_RETURN = 5;
/** A tab switch shorter than this is not a round trip to GitHub. */
const MIN_AWAY_MS = 2000;

/** Remember a github.com PR or issue URL. Other URLs (workflow runs, releases) are ignored. */
export function noteOpened(url: string) {
	const m = url.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/(?:pull|issues)\/(\d+)/);
	if (m) opened.set(`${m[1]}#${m[2]}`, { repo: m[1], number: Number(m[2]), at: Date.now() });
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
	const results = await Promise.all(
		due.slice(-MAX_PER_RETURN).map(([, o]) => api.recheck(o.repo, o.number).catch(() => null))
	);
	reportResolved(results.flatMap((r) => r?.resolved ?? []));
	await Promise.all([
		queryClient.invalidateQueries({ queryKey: keys.threadsAll }),
		queryClient.invalidateQueries({ queryKey: keys.dashAll })
	]);
}

/** A toast for threads a check moved to Done. */
export function reportResolved(resolved: { title: string; note: string }[]) {
	if (resolved.length === 1) toast.success(resolved[0].note, { description: resolved[0].title });
	else if (resolved.length > 1)
		toast.success(`${resolved.length} items moved to Done`, {
			description: resolved.map((r) => `${r.note}: ${r.title}`).join('\n')
		});
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
