<script lang="ts">
	import CircleX from '@lucide/svelte/icons/circle-x';
	import GitMerge from '@lucide/svelte/icons/git-merge';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Search from '@lucide/svelte/icons/search';
	import Bell from '@lucide/svelte/icons/bell';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import MockAvatar from './mock-avatar.svelte';
	import PushAlert from './push-alert.svelte';
	import { PEOPLE, signalColor, type MockPerson, type Signal } from './mock';

	interface Row {
		what: string;
		title: string;
		repo: string;
		why: string;
		since?: string;
		action: string;
		signal: Signal;
		person?: MockPerson;
		icon?: 'fail' | 'merge';
	}

	const ROWS: Row[] = [
		{
			what: '@alice requests your review',
			title: 'Fix token refresh race in session middleware',
			repo: 'acme/web #482',
			why: 'Review requested',
			since: '+2 commits',
			action: 'Review',
			signal: 'review',
			person: PEOPLE.alice
		},
		{
			what: 'CI failed on your PR',
			title: 'Move billing webhooks to the queue worker',
			repo: 'acme/api #1291',
			why: 'You opened this',
			since: 'CI fails',
			action: 'Fix CI',
			signal: 'fail',
			icon: 'fail'
		},
		{
			what: '@bo replied',
			title: 'Search results flicker on slow networks',
			repo: 'acme/web #477',
			why: 'Assigned to you',
			action: 'Reply',
			signal: 'reply',
			person: PEOPLE.bo
		},
		{
			what: 'Approved, ready to merge',
			title: 'Bump Node to 22 in the CI images',
			repo: 'acme/infra #88',
			why: 'You opened this',
			since: '@mei approved',
			action: 'Merge',
			signal: 'merge',
			icon: 'merge'
		},
		{
			what: '@sam requested changes',
			title: 'Add a retry budget to the GitHub client',
			repo: 'acme/api #1302',
			why: 'You opened this',
			action: 'Address',
			signal: 'warn',
			person: PEOPLE.sam
		}
	];

	const TABS = [
		{ label: 'Needs you', count: 5, active: true },
		{ label: 'FYI', count: 6 },
		{ label: 'Snoozed' },
		{ label: 'Done' },
		{ label: 'Muted' },
		{ label: 'Web reviews', count: 2 }
	];
</script>

<div class="stage" aria-hidden="true">
	<div class="window">
		<div class="bar">
			<span class="brand"><img src="/icon.svg" alt="" />hush</span>
			<span class="nav">
				<span class="on">Inbox <i>5</i></span>
				<span>Pull requests <i>3</i></span>
				<span>Issues <i>1</i></span>
			</span>
			<span class="tools">
				<span class="search"><Search size={13} />Search<kbd>⌘K</kbd></span>
				<Bell size={15} />
				<MockAvatar person={PEOPLE.you} size={1.5} />
			</span>
		</div>

		<div class="tabs">
			{#each TABS as tab (tab.label)}
				<span class:on={tab.active}
					>{tab.label}{#if tab.count}<i>{tab.count}</i>{/if}</span
				>
			{/each}
		</div>

		<div class="body">
			<ul class="list">
				{#each ROWS as row, i (row.title)}
					<li class:cursor={i === 0} style:--signal={signalColor(row.signal)}>
						<span class="who">
							{#if row.person}
								<MockAvatar person={row.person} />
							{:else if row.icon === 'fail'}
								<span class="glyph"><CircleX size={16} /></span>
							{:else}
								<span class="glyph"><GitMerge size={16} /></span>
							{/if}
						</span>
						<span class="text">
							<span class="what">{row.what}</span>
							<span class="title">{row.title}</span>
							<span class="meta">
								<span>{row.repo}</span>
								<span class="tag">{row.why}</span>
								{#if row.since}<span class="since">{row.since}</span>{/if}
							</span>
						</span>
						<span class="main">{row.action}</span>
					</li>
				{/each}
			</ul>

			<div class="peek">
				<div class="peek-scroll">
					<p class="reason">
						<b>Needs you:</b> @alice requests your review, for 3h
					</p>
					<p class="changed">Since you looked: +2 commits · CI passes now</p>
					<p class="peek-title">Fix token refresh race in session middleware</p>
					<p class="peek-meta">
						<span class="state">Open</span>
						<span>acme/web#482</span>
						<span>alice/token-race → main</span>
						<span class="diff"><b>+84</b> <s>−21</s></span>
					</p>
					<div class="checks">
						<CircleCheck size={14} />
						<span>12 checks passed</span>
						<span class="reviewer"
							><MockAvatar person={PEOPLE.mei} size={1.125} /> mei approved</span
						>
					</div>
					<div class="desc">
						<p>
							Two tabs could refresh the token at the same time, and the second one signed you out.
							This takes a short lock for each session.
						</p>
						<p class="react"><span>👍 3</span><span>🎉 1</span></p>
					</div>
					<div class="comment">
						<MockAvatar person={PEOPLE.mei} size={1.25} />
						<p><b>mei</b> The lock timeout matches the gateway. Ship it.</p>
					</div>
				</div>
				<div class="peek-bar">
					<span class="ghost">Done <kbd>E</kbd></span>
					<span class="ghost">Snooze <kbd>S</kbd></span>
					<span class="ghost">Mute <kbd>M</kbd></span>
					<span class="primary">Approve <kbd>A</kbd></span>
					<span class="ghost more">More <ChevronDown size={12} /></span>
				</div>
			</div>
		</div>
	</div>

	<div class="float">
		<PushAlert
			title="@alice requests your review"
			body="acme/web#482 · Fix token refresh race in session middleware"
		/>
	</div>
</div>

<style>
	.stage {
		--ease: cubic-bezier(0.16, 1, 0.3, 1);
		position: relative;
		font-size: 0.8125rem;
		line-height: 1.35;
		text-align: left;
	}
	.window {
		overflow: hidden;
		border-radius: 1rem;
		border: 1px solid color-mix(in oklab, var(--foreground) 10%, transparent);
		background: var(--background);
		box-shadow:
			0 1px 2px rgb(0 0 0 / 0.05),
			0 30px 80px -30px rgb(0 0 0 / 0.35);
	}
	kbd {
		font: inherit;
		font-size: 0.6875rem;
		color: var(--muted-foreground);
	}
	i {
		font-style: normal;
		font-size: 0.6875rem;
		font-variant-numeric: tabular-nums;
		color: var(--muted-foreground);
	}

	.bar {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 0.7rem 1rem;
		border-bottom: 1px solid var(--border);
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-weight: 600;
		letter-spacing: -0.02em;
	}
	.brand img {
		width: 1.125rem;
		height: 1.125rem;
		border-radius: 0.3rem;
	}
	.nav {
		display: flex;
		gap: 0.25rem;
		color: var(--muted-foreground);
	}
	.nav span {
		display: inline-flex;
		gap: 0.35rem;
		padding: 0.3rem 0.6rem;
		border-radius: 0.5rem;
	}
	.nav .on {
		background: var(--muted);
		color: var(--foreground);
		font-weight: 500;
	}
	.tools {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		margin-left: auto;
		color: var(--muted-foreground);
	}
	.search {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		width: 11rem;
		padding: 0.3rem 0.5rem;
		border-radius: 0.5rem;
		border: 1px solid var(--border);
	}
	.search kbd {
		margin-left: auto;
	}

	.tabs {
		display: flex;
		gap: 1.25rem;
		padding: 0 1rem;
		border-bottom: 1px solid var(--border);
		color: var(--muted-foreground);
		white-space: nowrap;
		overflow: hidden;
	}
	.tabs span {
		display: inline-flex;
		gap: 0.35rem;
		padding: 0.6rem 0 0.55rem;
		border-bottom: 2px solid transparent;
	}
	.tabs .on {
		border-color: var(--foreground);
		color: var(--foreground);
		font-weight: 500;
	}

	.body {
		display: grid;
		grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
		min-height: 25rem;
	}
	.list {
		display: grid;
		align-content: start;
		padding: 0.375rem;
	}
	.list li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.75rem;
		padding: 0.7rem 0.75rem;
		border-radius: 0.625rem;
	}
	.list li + li {
		box-shadow: 0 -1px 0 var(--border);
	}
	.list li.cursor,
	.list li.cursor + li {
		box-shadow: none;
	}
	.list li.cursor {
		background: color-mix(in oklab, var(--signal-review) 9%, transparent);
	}
	.glyph {
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 999px;
		color: var(--signal);
		background: color-mix(in oklab, var(--signal) 13%, transparent);
	}
	.text {
		display: grid;
		gap: 0.1rem;
		min-width: 0;
	}
	.what {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--signal);
	}
	.title {
		overflow: hidden;
		font-weight: 500;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.meta {
		display: flex;
		gap: 0.5rem;
		overflow: hidden;
		font-size: 0.6875rem;
		color: var(--muted-foreground);
		white-space: nowrap;
	}
	.tag {
		padding: 0 0.35rem;
		border-radius: 0.3rem;
		background: var(--muted);
	}
	.since {
		color: var(--foreground);
	}
	.main {
		padding: 0.3rem 0.65rem;
		border-radius: 0.5rem;
		border: 1px solid color-mix(in oklab, var(--signal) 35%, var(--border));
		color: var(--signal);
		font-size: 0.75rem;
		font-weight: 500;
	}
	.cursor .main {
		border-color: transparent;
		background: var(--signal);
		color: var(--background);
	}

	.peek {
		display: grid;
		grid-template-rows: 1fr auto;
		border-left: 1px solid var(--border);
		background: color-mix(in oklab, var(--muted) 35%, var(--background));
	}
	.peek-scroll {
		display: grid;
		align-content: start;
		gap: 0.6rem;
		padding: 1rem 1.125rem;
	}
	.reason {
		font-size: 0.75rem;
		color: var(--muted-foreground);
	}
	.reason b {
		font-weight: 600;
		color: var(--signal-review);
	}
	.changed {
		margin-top: -0.35rem;
		font-size: 0.6875rem;
		color: var(--muted-foreground);
	}
	.peek-title {
		font-size: 1rem;
		font-weight: 600;
		line-height: 1.25;
		letter-spacing: -0.01em;
		text-wrap: balance;
	}
	.peek-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem 0.6rem;
		font-size: 0.6875rem;
		color: var(--muted-foreground);
	}
	.state {
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
		background: color-mix(in oklab, var(--signal-merge) 16%, transparent);
		color: var(--signal-merge);
		font-weight: 600;
	}
	.diff b {
		font-weight: 500;
		color: var(--signal-merge);
	}
	.diff s {
		text-decoration: none;
		color: var(--signal-fail);
	}
	.checks {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 0.625rem;
		border-radius: 0.5rem;
		border: 1px solid var(--border);
		background: var(--background);
		font-size: 0.75rem;
		color: var(--signal-merge);
	}
	.checks > span:first-of-type {
		color: var(--foreground);
	}
	.reviewer {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		margin-left: auto;
		color: var(--muted-foreground);
	}
	.desc {
		display: grid;
		gap: 0.5rem;
		font-size: 0.75rem;
		line-height: 1.5;
	}
	.react {
		display: flex;
		gap: 0.35rem;
	}
	.react span {
		padding: 0.05rem 0.45rem;
		border-radius: 999px;
		border: 1px solid var(--border);
		font-size: 0.6875rem;
	}
	.comment {
		display: flex;
		gap: 0.5rem;
		padding-top: 0.6rem;
		border-top: 1px solid var(--border);
		font-size: 0.75rem;
	}
	.comment b {
		margin-right: 0.3rem;
		font-weight: 600;
	}
	.peek-bar {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.6rem 0.75rem;
		border-top: 1px solid var(--border);
		background: var(--background);
		font-size: 0.75rem;
	}
	.peek-bar > span {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.3rem 0.55rem;
		border-radius: 0.5rem;
		white-space: nowrap;
	}
	.ghost {
		border: 1px solid var(--border);
	}
	.primary {
		margin-left: auto;
		background: var(--foreground);
		color: var(--background);
		font-weight: 500;
	}
	.primary kbd {
		color: color-mix(in oklab, var(--background) 65%, transparent);
	}

	.float {
		position: absolute;
		top: -3rem;
		right: -2rem;
		width: 19rem;
		animation: drop 1.1s var(--ease) 0.7s both;
	}
	@keyframes drop {
		from {
			opacity: 0;
			translate: 0 -1rem;
			scale: 0.96;
			filter: blur(6px);
		}
	}

	@media (max-width: 72rem) {
		.float {
			right: -0.75rem;
		}
	}
	@media (max-width: 60rem) {
		.body {
			grid-template-columns: minmax(0, 1fr);
			min-height: 0;
		}
		.peek {
			display: none;
		}
		.search {
			width: auto;
		}
	}
	@media (max-width: 40rem) {
		.stage {
			font-size: 0.75rem;
		}
		.nav span:not(.on),
		.search,
		.tools :global(svg) {
			display: none;
		}
		.tabs {
			gap: 0.875rem;
			padding: 0 0.75rem;
		}
		.list li {
			gap: 0.6rem;
			padding: 0.6rem 0.5rem;
		}
		.meta .tag,
		.list li:nth-child(n + 5) {
			display: none;
		}
		.float {
			top: auto;
			right: 0.75rem;
			bottom: -4.5rem;
			left: 0.75rem;
			width: auto;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.float {
			animation: none;
		}
	}
</style>
