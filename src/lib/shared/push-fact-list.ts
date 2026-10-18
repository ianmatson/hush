export type PushFact =
	| 'review-requested'
	| 'team-review-requested'
	| 'mentioned'
	| 'replied'
	| 'approved'
	| 'changes-requested'
	| 'ci-failed'
	| 'ci-passed'
	| 'assigned'
	| 'snooze-over';

export const PUSH_FACTS: { id: PushFact; label: string; note: string }[] = [
	{
		id: 'review-requested',
		label: 'Your review is requested',
		note: 'By name, also again after your review.'
	},
	{
		id: 'team-review-requested',
		label: "Your team's review is requested",
		note: 'A team that you track in Settings → Views → Teams.'
	},
	{ id: 'mentioned', label: 'You are mentioned', note: 'Someone writes @you or @your-team.' },
	{
		id: 'replied',
		label: 'Someone replies',
		note: 'A comment on your pull request or issue, or right after your comment.'
	},
	{ id: 'approved', label: 'Your pull request is approved', note: '' },
	{ id: 'changes-requested', label: 'Changes are requested on your pull request', note: '' },
	{ id: 'ci-failed', label: 'CI fails on your pull request', note: '' },
	{ id: 'ci-passed', label: 'CI passes on your pull request', note: '' },
	{ id: 'assigned', label: 'You are assigned', note: '' },
	{
		id: 'snooze-over',
		label: 'A snooze ends',
		note: 'When the thing that you snoozed it until happens, such as CI passes.'
	}
];

export const DEFAULT_PUSH_FACTS: PushFact[] = [
	'review-requested',
	'mentioned',
	'replied',
	'approved',
	'changes-requested',
	'ci-failed',
	'assigned',
	'snooze-over'
];
