<script lang="ts">
	import { fly } from 'svelte/transition';
	import { MediaQuery } from 'svelte/reactivity';
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
	const TAIL = [
		{ repo: 'acme/web', title: 'Bump prettier from 3.3 to 3.4', reason: 'subscribed' },
		{ repo: 'acme/infra', title: 'Nightly build: all checks passed', reason: 'ci activity' }
	];
	const LAST = INCOMING.length - 1;
	const STEP_MS = 650;
	const HOLD_MS = 3200;
	const ROW_REM = 2.25;

	const reducedMotion = new MediaQuery('prefers-reduced-motion: reduce');
	let cursor = $state(LAST);
	let running = $state(false);

	const sent = $derived(
		INCOMING.map((row, i) => ({ ...row, i })).filter(
			(row) => row.sorted === 'action' && row.i <= cursor
		)
	);

	function scanWhileVisible(node: HTMLElement) {
		if (reducedMotion.current) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const tickScan = () => {
			if (cursor >= LAST) {
				timer = setTimeout(() => {
					cursor = 0;
					timer = setTimeout(tickScan, STEP_MS);
				}, HOLD_MS);
				return;
			}
			cursor += 1;
			timer = setTimeout(tickScan, STEP_MS);
		};
		const observer = new IntersectionObserver(([entry]) => {
			clearTimeout(timer);
			if (entry.isIntersecting) {
				running = true;
				cursor = 0;
				timer = setTimeout(tickScan, STEP_MS);
			} else {
				running = false;
				cursor = LAST;
			}
		});
		observer.observe(node);
		return () => {
			observer.disconnect();
			clearTimeout(timer);
		};
	}
</script>

<div class="sort" aria-hidden="true" {@attach scanWhileVisible}>
	<div class="panel before">
		<div class="head">
			<span>GitHub notifications</span>
			<b>47 unread</b>
		</div>
		<ul class="incoming">
			{#each INCOMING as row, i (row.title)}
				<li
					class={i <= cursor ? row.sorted : 'waiting'}
					class:scanned={running && i === cursor}
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
			{#each TAIL as row (row.title)}
				<li class="tail">
					<span class="dot"></span>
					<span class="line">
						<span class="t">{row.title}</span>
						<span class="r">{row.repo} · {row.reason}</span>
					</span>
					<span class="label"></span>
				</li>
			{/each}
		</ul>
		{#if running}
			<span class="scanner" style:translate="0 {cursor * ROW_REM}rem"></span>
		{/if}
	</div>

	<span class="arrow"><ArrowRight size={20} /></span>

	<div class="panel after">
		<div class="head">
			<span>Hush</span>
			<b>Needs you · {sent.length}</b>
		</div>
		<ul class="needs">
			{#each sent as row (row.title)}
				<li style:--signal={signalColor(row.signal ?? 'review')} in:fly={{ x: -16, duration: 350 }}>
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
		transition:
			opacity 0.35s var(--ease),
			background 0.35s var(--ease);
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
		color: var(--muted-foreground);
		transition:
			opacity 0.3s var(--ease),
			translate 0.3s var(--ease);
	}
	.incoming .waiting .label {
		opacity: 0;
		translate: -0.5rem 0;
	}
	.incoming .action {
		background: color-mix(in oklab, var(--signal) 12%, transparent);
	}
	.incoming .action .label {
		color: var(--signal);
	}
	.incoming .fyi {
		opacity: 0.55;
	}
	.incoming .done {
		opacity: 0.28;
	}
	.incoming .scanned {
		opacity: 1;
	}
	.scanner {
		position: absolute;
		top: calc(2.6rem - 1px);
		left: 0;
		right: 0;
		height: calc(2.25rem + 2px);
		border-block: 1px solid color-mix(in oklab, var(--signal-review) 55%, transparent);
		background: color-mix(in oklab, var(--signal-review) 14%, transparent);
		box-shadow: 0 0 24px -6px color-mix(in oklab, var(--signal-review) 50%, transparent);
		transition: translate 0.22s var(--ease);
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

	.after {
		align-self: stretch;
		display: grid;
		grid-template-rows: auto 1fr auto;
	}
	.needs {
		display: grid;
		align-content: start;
		padding: 0.375rem;
	}
	.needs li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.75rem;
		padding: 0.7rem 0.75rem;
		border-radius: 0.625rem;
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

	@media (max-width: 52rem) {
		.sort {
			grid-template-columns: minmax(0, 1fr);
			justify-items: stretch;
		}
		.arrow {
			justify-self: center;
			rotate: 90deg;
		}
		.after {
			min-height: 22.5rem;
		}
	}
	@media (max-width: 30rem) {
		.incoming .r {
			display: none;
		}
	}
</style>
