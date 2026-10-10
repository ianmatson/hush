<script lang="ts">
	import Users from '@lucide/svelte/icons/users';
	import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
	import Kanban from '@lucide/svelte/icons/kanban';
	import Shapes from '@lucide/svelte/icons/shapes';
	import ListFilter from '@lucide/svelte/icons/list-filter';
	import FolderGit from '@lucide/svelte/icons/folder-git-2';
	import type { Component } from 'svelte';

	interface Row {
		label: string;
		count: number;
		color?: string;
		rule?: string;
		muted?: boolean;
	}

	interface Card {
		title: string;
		icon: Component;
		note: string;
		rows: Row[];
	}

	const CARDS: Card[] = [
		{
			title: 'Your role',
			icon: Users,
			note: 'What you have to do with it',
			rows: [
				{ label: 'You opened', count: 4 },
				{ label: 'Reviews', count: 3 },
				{ label: 'Assigned to you', count: 1 },
				{ label: 'Involved', count: 2 }
			]
		},
		{
			title: 'Status',
			icon: GitPullRequest,
			note: 'Where the review stands',
			rows: [
				{ label: 'No review yet', count: 1 },
				{ label: 'In review', count: 3 },
				{ label: 'Changes requested', count: 1, color: 'var(--signal-fail)' },
				{ label: 'Approved', count: 2, color: 'var(--signal-merge)' }
			]
		},
		{
			title: 'Project board',
			icon: Kanban,
			note: 'The columns of a GitHub project',
			rows: [
				{ label: 'Todo', count: 5, color: 'oklch(0.7 0.02 260)' },
				{ label: 'In progress', count: 3, color: 'oklch(0.78 0.15 85)' },
				{ label: 'In review', count: 2, color: 'oklch(0.65 0.17 300)' },
				{ label: 'Not in project', count: 2, muted: true }
			]
		},
		{
			title: 'A category group',
			icon: Shapes,
			note: 'Effort, by rule or by Jev',
			rows: [
				{ label: 'Low', count: 6, color: 'var(--signal-merge)' },
				{ label: 'Medium', count: 3, color: 'var(--signal-warn)' },
				{ label: 'High', count: 1, color: 'var(--signal-fail)' },
				{ label: 'Not sorted', count: 2, muted: true }
			]
		},
		{
			title: 'Custom sections',
			icon: ListFilter,
			note: 'Your rules, first match wins',
			rows: [
				{ label: 'Failing CI', count: 1, rule: 'status:failure' },
				{ label: 'Small', count: 3, rule: 'size:<100' },
				{ label: 'Stale', count: 2, rule: 'updated:<@today-7d' },
				{ label: 'Everything else', count: 4, muted: true }
			]
		},
		{
			title: 'Repository',
			icon: FolderGit,
			note: 'Or author, label, or assignee',
			rows: [
				{ label: 'PostHog/posthog.com', count: 8 },
				{ label: 'PostHog/posthog', count: 3 },
				{ label: 'ianmatson/hush', count: 1 }
			]
		}
	];
</script>

<div class="gallery" aria-hidden="true">
	{#each CARDS as card, i (card.title)}
		<div class="card" style:--i={i}>
			<p class="head">
				<card.icon size={15} />
				<b>{card.title}</b>
			</p>
			<p class="note">{card.note}</p>
			<ul>
				{#each card.rows as row (row.label)}
					<li class:muted={row.muted}>
						<span class="dot" style:background={row.color ?? 'var(--muted-foreground)'}></span>
						<span class="label">{row.label}</span>
						{#if row.rule}<code>{row.rule}</code>{/if}
						<i>{row.count}</i>
					</li>
				{/each}
			</ul>
		</div>
	{/each}
</div>

<style>
	.gallery {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1rem;
		text-align: left;
	}
	.card {
		display: grid;
		align-content: start;
		gap: 0.25rem;
		padding: 1rem 1.1rem 0.9rem;
		border-radius: 1rem;
		border: 1px solid color-mix(in oklab, var(--foreground) 10%, transparent);
		background: var(--background);
		box-shadow: 0 24px 60px -40px rgb(0 0 0 / 0.35);
		font-size: 0.8125rem;
		line-height: 1.3;
		transition:
			translate 0.3s var(--ease, ease),
			box-shadow 0.3s var(--ease, ease);
	}
	.card:hover {
		translate: 0 -2px;
		box-shadow: 0 30px 70px -40px rgb(0 0 0 / 0.45);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
	}
	.head :global(svg) {
		color: var(--signal-review);
	}
	.head b {
		font-weight: 600;
	}
	.note {
		margin-bottom: 0.5rem;
		font-size: 0.75rem;
		color: var(--muted-foreground);
	}
	ul {
		display: grid;
	}
	li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0;
		border-top: 1px solid var(--border);
	}
	.dot {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 999px;
	}
	.label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		font-size: 0.6875rem;
	}
	.muted .label {
		color: var(--muted-foreground);
	}
	code {
		max-width: 9rem;
		overflow: hidden;
		padding: 0.05em 0.35em;
		border-radius: 0.3rem;
		background: color-mix(in oklab, var(--foreground) 7%, transparent);
		font-family: ui-monospace, 'SF Mono', Menlo, monospace;
		font-size: 0.65rem;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--muted-foreground);
	}
	i {
		font-style: normal;
		font-size: 0.6875rem;
		color: var(--muted-foreground);
		font-variant-numeric: tabular-nums;
	}
	@media (max-width: 60rem) {
		.gallery {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 36rem) {
		.gallery {
			display: flex;
			gap: 0.75rem;
			margin: 0 -1.5rem;
			padding: 0 1.5rem 1.5rem;
			overflow-x: auto;
			scroll-snap-type: x mandatory;
			scroll-padding: 0 1.5rem;
			scrollbar-width: none;
		}
		.card {
			flex: 0 0 82%;
			scroll-snap-align: start;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.card {
			transition: none;
		}
	}
</style>
