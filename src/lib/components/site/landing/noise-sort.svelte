<script lang="ts">
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import { signalColor, type Signal } from './mock';

	type Sorted = 'action' | 'fyi' | 'done';

	interface Incoming {
		repo: string;
		title: string;
		reason: string;
		sorted: Sorted;
		signal?: Signal;
		action?: string;
	}

	const INCOMING: Incoming[] = [
		{
			repo: 'acme/web',
			title: 'Bump eslint from 9.11 to 9.12',
			reason: 'subscribed',
			sorted: 'done'
		},
		{
			repo: 'acme/web',
			title: 'Fix token refresh race in session middleware',
			reason: 'review requested',
			sorted: 'action',
			signal: 'review',
			action: 'Review'
		},
		{
			repo: 'acme/api',
			title: 'Deploy preview: all checks passed',
			reason: 'ci activity',
			sorted: 'done'
		},
		{ repo: 'acme/design', title: 'Release v4.2.0', reason: 'subscribed', sorted: 'fyi' },
		{
			repo: 'acme/api',
			title: 'Move billing webhooks to the queue worker',
			reason: 'author',
			sorted: 'action',
			signal: 'fail',
			action: 'Fix CI'
		},
		{ repo: 'acme/web', title: 'Update README badges', reason: 'state change', sorted: 'done' },
		{
			repo: 'acme/infra',
			title: 'Update dependency vite to v7.1.4',
			reason: 'subscribed',
			sorted: 'done'
		},
		{
			repo: 'acme/web',
			title: 'Search results flicker on slow networks',
			reason: 'comment',
			sorted: 'action',
			signal: 'reply',
			action: 'Reply'
		},
		{ repo: 'acme/handbook', title: 'Q4 planning notes', reason: 'team mention', sorted: 'fyi' },
		{
			repo: 'acme/api',
			title: 'chore: regenerate OpenAPI client',
			reason: 'subscribed',
			sorted: 'done'
		},
		{
			repo: 'acme/infra',
			title: 'Bump Node to 22 in the CI images',
			reason: 'author',
			sorted: 'action',
			signal: 'merge',
			action: 'Merge'
		},
		{
			repo: 'acme/web',
			title: 'Bump @types/node from 22.7 to 22.8',
			reason: 'subscribed',
			sorted: 'done'
		},
		{
			repo: 'acme/docs',
			title: 'Typo in the getting started guide',
			reason: 'state change',
			sorted: 'done'
		},
		{
			repo: 'acme/api',
			title: 'Add a retry budget to the GitHub client',
			reason: 'author',
			sorted: 'action',
			signal: 'warn',
			action: 'Address'
		}
	];

	const LABEL: Record<Sorted, string> = { action: 'Needs you', fyi: 'FYI', done: 'Done' };
	const needsYou = INCOMING.map((row, i) => ({ ...row, i })).filter(
		(row) => row.sorted === 'action'
	);
</script>

<div class="sort" aria-hidden="true" style:--rows={INCOMING.length}>
	<div class="panel before">
		<div class="head">
			<span>GitHub notifications</span>
			<b>47 unread</b>
		</div>
		<ul class="incoming">
			{#each INCOMING as row, i (row.title)}
				<li
					class={row.sorted}
					style:--i={i}
					style:--signal={row.signal ? signalColor(row.signal) : 'var(--muted-foreground)'}
				>
					<span class="dot"></span>
					<span class="line">
						<span class="t">{row.title}</span>
						<span class="r">{row.repo} · {row.reason}</span>
					</span>
					<span class="label">{LABEL[row.sorted]}</span>
				</li>
			{/each}
		</ul>
		<span class="sweep"></span>
	</div>

	<span class="arrow"><ArrowRight size={20} /></span>

	<div class="panel after">
		<div class="head">
			<span>Hush</span>
			<b>Needs you · 5</b>
		</div>
		<ul class="needs">
			{#each needsYou as row (row.title)}
				<li style:--i={row.i} style:--signal={signalColor(row.signal ?? 'review')}>
					<span class="line">
						<span class="t">{row.title}</span>
						<span class="r">{row.repo}</span>
					</span>
					<span class="go">{row.action}</span>
				</li>
			{/each}
		</ul>
		<div class="rest">
			<span><b>6</b> FYI, to read later</span>
			<span><b>36</b> already finished, moved to Done</span>
		</div>
	</div>
</div>

<style>
	.sort {
		--loop: 11s;
		--step: 0.4s;
		--ease: cubic-bezier(0.16, 1, 0.3, 1);
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: center;
		gap: 1.25rem;
		font-size: 0.8125rem;
		line-height: 1.3;
		text-align: left;
	}
	.panel {
		position: relative;
		overflow: hidden;
		border-radius: 1rem;
		border: 1px solid var(--border);
		background: var(--background);
		box-shadow: 0 30px 70px -35px rgb(0 0 0 / 0.6);
	}
	.head {
		display: flex;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--border);
		font-size: 0.75rem;
		color: var(--muted-foreground);
	}
	.head b {
		font-weight: 600;
		color: var(--foreground);
		font-variant-numeric: tabular-nums;
	}
	.line {
		display: grid;
		min-width: 0;
	}
	.t {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.r {
		font-size: 0.6875rem;
		color: var(--muted-foreground);
	}

	.before {
		height: 31rem;
	}
	.before::after {
		content: '';
		position: absolute;
		inset: auto 0 0;
		height: 4rem;
		background: linear-gradient(transparent, var(--background));
		pointer-events: none;
	}
	.incoming li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.625rem;
		height: 2.25rem;
		padding: 0 1rem;
		border-bottom: 1px solid var(--border);
		animation: sorted var(--loop) var(--ease) infinite;
		animation-delay: calc(var(--i) * var(--step));
	}
	.incoming .t {
		font-weight: 500;
	}
	.incoming .line {
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: baseline;
		gap: 0.75rem;
	}
	.dot {
		width: 0.4rem;
		height: 0.4rem;
		border-radius: 999px;
		background: var(--signal-review);
	}
	.label {
		min-width: 4.25rem;
		font-size: 0.6875rem;
		font-weight: 600;
		text-align: right;
		color: var(--signal);
		opacity: 0;
		animation: label var(--loop) var(--ease) infinite;
		animation-delay: calc(var(--i) * var(--step));
	}
	.incoming .fyi .label,
	.incoming .done .label {
		color: var(--muted-foreground);
	}
	.sweep {
		position: absolute;
		left: 0;
		right: 0;
		top: 2.6rem;
		height: 2.25rem;
		background: linear-gradient(
			90deg,
			transparent,
			color-mix(in oklab, var(--signal-review) 22%, transparent) 30%,
			color-mix(in oklab, var(--signal-review) 22%, transparent) 70%,
			transparent
		);
		border-block: 1px solid color-mix(in oklab, var(--signal-review) 40%, transparent);
		animation: sweep var(--loop) linear infinite;
		pointer-events: none;
	}

	.arrow {
		display: grid;
		place-items: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 999px;
		border: 1px solid var(--border);
		color: var(--muted-foreground);
	}

	.needs {
		display: grid;
		padding: 0.375rem;
	}
	.needs li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.75rem;
		padding: 0.7rem 0.75rem;
		border-radius: 0.625rem;
		animation: arrive var(--loop) var(--ease) infinite;
		animation-delay: calc(var(--i) * var(--step));
	}
	.needs li + li {
		box-shadow: 0 -1px 0 var(--border);
	}
	.needs .t {
		font-weight: 500;
	}
	.go {
		padding: 0.25rem 0.6rem;
		border-radius: 0.5rem;
		border: 1px solid color-mix(in oklab, var(--signal) 45%, var(--border));
		color: var(--signal);
		font-size: 0.75rem;
		font-weight: 500;
	}
	.rest {
		display: grid;
		gap: 0.35rem;
		padding: 0.875rem 1.125rem 1rem;
		border-top: 1px solid var(--border);
		font-size: 0.75rem;
		color: var(--muted-foreground);
	}
	.rest b {
		display: inline-block;
		min-width: 1.75rem;
		font-weight: 600;
		color: var(--foreground);
		font-variant-numeric: tabular-nums;
	}

	@keyframes sweep {
		0% {
			translate: 0 0;
			opacity: 1;
		}
		48% {
			opacity: 1;
		}
		52% {
			translate: 0 calc(var(--rows) * 2.25rem);
			opacity: 0;
		}
		100% {
			translate: 0 calc(var(--rows) * 2.25rem);
			opacity: 0;
		}
	}
	@keyframes sorted {
		0%,
		2% {
			opacity: 1;
			background: transparent;
		}
		5%,
		82% {
			opacity: var(--dim, 1);
			background: var(--wash, transparent);
		}
		92%,
		100% {
			opacity: 1;
			background: transparent;
		}
	}
	.incoming .action {
		--wash: color-mix(in oklab, var(--signal) 12%, transparent);
	}
	.incoming .fyi {
		--dim: 0.55;
	}
	.incoming .done {
		--dim: 0.28;
	}
	@keyframes label {
		0%,
		2% {
			opacity: 0;
			translate: -0.5rem 0;
		}
		6%,
		82% {
			opacity: 1;
			translate: 0 0;
		}
		92%,
		100% {
			opacity: 0;
		}
	}
	@keyframes arrive {
		0%,
		2% {
			opacity: 0.25;
			translate: -0.5rem 0;
			filter: blur(2px);
		}
		7%,
		82% {
			opacity: 1;
			translate: 0 0;
			filter: blur(0);
		}
		92%,
		100% {
			opacity: 0.25;
			filter: blur(2px);
		}
	}

	@media (max-width: 52rem) {
		.sort {
			grid-template-columns: minmax(0, 1fr);
			justify-items: stretch;
		}
		.arrow {
			justify-self: center;
			rotate: 90deg;
		}
		.before {
			height: 20rem;
		}
	}
	@media (max-width: 30rem) {
		.incoming .r {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.incoming li,
		.label,
		.needs li,
		.sweep {
			animation: none;
		}
		.sweep {
			display: none;
		}
		.label {
			opacity: 1;
		}
		.incoming li {
			opacity: var(--dim, 1);
			background: var(--wash, transparent);
		}
	}
</style>
