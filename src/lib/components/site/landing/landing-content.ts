import Layers from '@lucide/svelte/icons/layers';
import AlarmClock from '@lucide/svelte/icons/alarm-clock';
import Timer from '@lucide/svelte/icons/timer';
import Moon from '@lucide/svelte/icons/moon';
import { PRICING_NOTE } from '$lib/pricing';
import { DEFAULT_PUSH_FACTS, PUSH_FACTS, type PushFact } from '$lib/shared/push-fact-list';
import { DIGEST_MINUTES } from '$lib/shared/push-policy';
import { REPO_URL } from '$lib/site';
import type { FaqItem } from '$lib/structured-data';

const FACT_CHIP: Record<PushFact, string> = {
	'review-requested': 'Review requested',
	'team-review-requested': 'Team review requested',
	mentioned: 'Mentioned',
	replied: 'Replied',
	approved: 'Approved',
	'changes-requested': 'Changes requested',
	'ci-failed': 'CI failed',
	'ci-passed': 'CI passed',
	assigned: 'Assigned',
	'snooze-over': 'A snooze ends'
};

const NEW_IN_A_VIEW = { name: 'New in a view', on: false };

const pushFactChips = PUSH_FACTS.map((f) => ({
	name: FACT_CHIP[f.id],
	on: DEFAULT_PUSH_FACTS.includes(f.id)
}));

export const FACTS = [
	...pushFactChips.filter((f) => f.on),
	...pushFactChips.filter((f) => !f.on),
	NEW_IN_A_VIEW
];

export const CALM = [
	{
		icon: Layers,
		title: 'One push for each item',
		text: 'An item pushes once, then waits until you open it.'
	},
	{
		icon: AlarmClock,
		title: 'Snooze until it happens',
		text: 'Snooze until CI passes or a review comes in. Hush pushes when it does.'
	},
	{
		icon: Timer,
		title: 'Digests and limits',
		text: `Collect pushes into one every ${DIGEST_MINUTES.min} to ${DIGEST_MINUTES.max} minutes, or cap how many can come in a set time.`
	},
	{
		icon: Moon,
		title: 'Quiet hours',
		text: 'Nights and weekends stay silent. One push in the morning lists what waited.'
	}
];

export const FAQ: FaqItem[] = [
	{
		question: 'What is Hush for GitHub?',
		answerHtml: `Hush is a web app for the pull requests and issues that you work on. Each <a href="/docs/views">view</a> is a GitHub search that stays live, grouped your way. Hush shows whose turn it is on each item, pushes only the facts that you choose, and lets you read, approve, comment, and merge in a side panel.`
	},
	{
		question: 'Is it free?',
		answerHtml: `${PRICING_NOTE} See <a href="/pricing">pricing</a> for the plans that come after the beta.`
	},
	{
		question: 'What access does it need?',
		answerHtml: `You sign in with GitHub. Hush asks for the <code>notifications</code>, <code>repo</code>, <code>read:org</code>, and <code>project</code> scopes, because GitHub’s Notifications API accepts only classic scopes. Hush stores the token encrypted, and it acts on GitHub only when you do. See <a href="/docs/github-access">GitHub access</a> and <a href="/security">security</a>.`
	},
	{
		question: 'Does it change my GitHub notifications?',
		answerHtml: `No. Hush reads your notifications only to see what changed, and it never marks them read or done. Snooze, mute, and unread stay in Hush. See <a href="/docs/views#views-and-github-notifications">views and GitHub notifications</a>.`
	},
	{
		question: 'Does my org need to approve it?',
		answerHtml: `Only if your org allows just the OAuth apps that an owner approved. Until an owner approves Hush, GitHub hides that org from it. Choose <b>Request approval</b> after you sign in, or, until then, give Hush a custom token, such as the one from <code>gh auth token</code>. See <a href="/docs/github-access#when-an-org-is-missing">when an org is missing</a>.`
	},
	{
		question: 'Does it work on my phone?',
		answerHtml: `Yes. Hush is a web app that you can install, with push alerts on each device where you turn them on. On iPhone and iPad, push works only after you add Hush to the Home Screen (iOS 16.4 or later): <b>Share</b>, then <b>Add to Home Screen</b>. See <a href="/docs/notifications">notifications</a>.`
	},
	{
		question: 'Is it open source? Can I host it myself?',
		answerHtml: `Yes. All of Hush, the app, the server, and this site, is open source under AGPL‑3.0, at <a href="${REPO_URL}" rel="noreferrer">github.com/ianmatson/hush</a>. You can run your own copy on your own Cloudflare account; the README tells you how.`
	},
	{
		question: 'How is it different from GitHub’s own inbox?',
		answerHtml: `GitHub’s inbox lists notifications by time. Hush starts from your work instead: searches that you choose, grouped by your role, status, a project board, or your own sections, with whose turn it is on each item. It pushes only the facts that you turn on. Use both: Hush never changes GitHub’s inbox. See <a href="/compare/github-notifications">Hush vs. GitHub notifications</a> and <a href="/compare">other tools</a>.`
	}
];
