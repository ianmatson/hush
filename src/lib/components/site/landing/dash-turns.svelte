<script lang="ts">
	import MockAvatar from './mock-avatar.svelte';
	import type { MockPerson } from './mock';
	import { DEMO_GH, DEMO_ME } from './demo-data';

	interface Item {
		title: string;
		repo: string;
		person: MockPerson;
		why: string;
		tone?: 'fail' | 'stale';
	}

	const GROUPS: { name: string; count: number; items: Item[] }[] = [
		{
			name: 'Your turn',
			count: 3,
			items: [
				{
					title: 'Add Juno customer case study and cross-links',
					repo: 'PostHog/posthog.com#20387',
					person: DEMO_GH.joethreepwood,
					why: 'Review requested'
				},
				{
					title: 'Add the Forum app at /forum',
					repo: 'PostHog/posthog.com#20508',
					person: DEMO_ME,
					why: 'CI failing',
					tone: 'fail'
				}
			]
		},
		{
			name: 'Your team’s turn',
			count: 1,
			items: [
				{
					title: '[blog] How one runtime manages cloud agents for four PostHog products',
					repo: 'PostHog/posthog.com#20454',
					person: DEMO_GH.cleoPleurodon,
					why: 'Review for your team'
				}
			]
		},
		{
			name: 'Waiting on others',
			count: 4,
			items: [
				{
					title: 'Replace avatar fallback with DrakeHog',
					repo: 'PostHog/posthog.com#20571',
					person: DEMO_ME,
					why: 'Waiting for review · 5d',
					tone: 'stale'
				}
			]
		}
	];

	const SECTIONS = [
		{ label: 'All', count: 9, on: true },
		{ label: 'Review requested', count: 3 },
		{ label: 'Your PRs', count: 4 },
		{ label: 'Team reviews', count: 2 }
	];
</script>

<div class="dash" aria-hidden="true">
	<div class="sections">
		{#each SECTIONS as section (section.label)}
			<span class:on={section.on}>{section.label} <i>{section.count}</i></span>
		{/each}
	</div>
	{#each GROUPS as group (group.name)}
		<div class="group">
			<p class="name">{group.name} <i>{group.count}</i></p>
			<ul>
				{#each group.items as item (item.title)}
					<li>
						<MockAvatar person={item.person} size={1.375} />
						<span class="line">
							<span class="t">{item.title}</span>
							<span class="r">{item.repo}</span>
						</span>
						<span class="why {item.tone ?? ''}">{item.why}</span>
					</li>
				{/each}
			</ul>
		</div>
	{/each}
</div>

<style>
	.dash {
		display: grid;
		gap: 0.875rem;
		padding: 1rem;
		border-radius: 1rem;
		border: 1px solid color-mix(in oklab, var(--foreground) 10%, transparent);
		background: var(--background);
		box-shadow: 0 30px 70px -40px rgb(0 0 0 / 0.35);
		font-size: 0.8125rem;
		line-height: 1.3;
		text-align: left;
	}
	i {
		font-style: normal;
		font-size: 0.6875rem;
		color: var(--muted-foreground);
		font-variant-numeric: tabular-nums;
	}
	.sections {
		display: flex;
		gap: 0.375rem;
		overflow: hidden;
		white-space: nowrap;
		font-size: 0.75rem;
	}
	.sections span {
		padding: 0.25rem 0.6rem;
		border-radius: 999px;
		border: 1px solid var(--border);
		color: var(--muted-foreground);
	}
	.sections .on {
		border-color: transparent;
		background: var(--muted);
		color: var(--foreground);
		font-weight: 500;
	}
	.name {
		margin-bottom: 0.25rem;
		font-size: 0.75rem;
		font-weight: 600;
	}
	li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.625rem;
		padding: 0.45rem 0;
	}
	li + li {
		border-top: 1px solid var(--border);
	}
	.line {
		display: grid;
		min-width: 0;
	}
	.t {
		overflow: hidden;
		font-weight: 500;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.r {
		font-size: 0.6875rem;
		color: var(--muted-foreground);
	}
	.why {
		font-size: 0.6875rem;
		color: var(--muted-foreground);
		white-space: nowrap;
	}
	.why.fail {
		color: var(--signal-fail);
	}
	.why.stale {
		color: var(--signal-warn);
	}
	@media (max-width: 30rem) {
		.why {
			display: none;
		}
	}
</style>
