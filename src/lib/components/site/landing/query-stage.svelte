<script lang="ts">
	import { onDestroy } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { GITHUB_MARK } from '../github-mark';
	import Sparkle from '@lucide/svelte/icons/sparkle';
	import MockAvatar from './mock-avatar.svelte';
	import { DEMO_GH, DEMO_ME } from './demo-data';

	type Runs = 'github' | 'hush';

	const TOKENS: { text: string; runs: Runs }[] = [
		{ text: 'is:open', runs: 'github' },
		{ text: 'review-requested:@me', runs: 'github' },
		{ text: 'updated:>@today-14d', runs: 'github' },
		{ text: '-author:bots', runs: 'hush' },
		{ text: 'size:<100', runs: 'hush' }
	];
	const FOUND = 38;
	const KEPT = 9;
	const STEP_MS = 520;
	const RESULTS_AFTER_MS = 450;

	const KEPT_ROWS = [
		{ title: 'Keep community profile actions in the window bottom bar', who: DEMO_ME, size: 67 },
		{
			title: 'chore(pages): move components out of src/pages',
			who: DEMO_GH.sarahxsanders,
			size: 23
		},
		{ title: 'Replace avatar fallback with DrakeHog', who: DEMO_GH.ivanagas, size: 4 }
	];

	const reducedMotion = new MediaQuery('prefers-reduced-motion: reduce');
	let shown = $state(0);
	let results = $state(false);
	let started = false;
	const timers: ReturnType<typeof setTimeout>[] = [];

	onDestroy(() => timers.forEach(clearTimeout));

	function play() {
		if (started) return;
		started = true;
		if (reducedMotion.current) {
			shown = TOKENS.length;
			results = true;
			return;
		}
		TOKENS.forEach((_, k) => timers.push(setTimeout(() => (shown = k + 1), STEP_MS * (k + 1))));
		timers.push(setTimeout(() => (results = true), STEP_MS * TOKENS.length + RESULTS_AFTER_MS));
	}

	function startWhenSeen(node: HTMLElement) {
		const seen = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					play();
					seen.disconnect();
				}
			},
			{ threshold: 0.5 }
		);
		seen.observe(node);
		return () => seen.disconnect();
	}

	const githubPart = TOKENS.filter((t) => t.runs === 'github')
		.map((t) => t.text)
		.join(' ');
	const hushPart = TOKENS.filter((t) => t.runs === 'hush')
		.map((t) => t.text)
		.join(' ');
</script>

<div class="stage" {@attach startWhenSeen}>
	<div class="box" aria-label="A search: {TOKENS.map((t) => t.text).join(' ')}">
		<span class="label">Search</span>
		<span class="tokens" aria-hidden="true">
			{#each TOKENS.slice(0, shown) as token (token.text)}
				<span class="token {token.runs}">{token.text}</span>
			{/each}
			<span class="caret" class:done={results}></span>
		</span>
	</div>

	<div class="flow" class:on={results}>
		<div class="step github">
			<span class="who"
				><svg viewBox="0 0 16 16" aria-hidden="true"><path d={GITHUB_MARK} /></svg> GitHub runs</span
			>
			<code>{githubPart}</code>
			<span class="count"><b>{FOUND}</b> found</span>
			<span class="bar" style:--fill="100%"></span>
		</div>
		<div class="step hush">
			<span class="who"><Sparkle size={14} /> Hush checks</span>
			<code>{hushPart}</code>
			<span class="count"><b>{KEPT}</b> kept</span>
			<span class="bar" style:--fill="{(KEPT / FOUND) * 100}%"></span>
		</div>
		<ul class="rows" aria-label="What the view shows">
			{#each KEPT_ROWS as row (row.title)}
				<li>
					<MockAvatar person={row.who} size={1.25} />
					<span class="t">{row.title}</span>
					<span class="size">{row.size} lines</span>
				</li>
			{/each}
			<li class="more">and {KEPT - KEPT_ROWS.length} more</li>
		</ul>
	</div>
</div>

<style>
	.stage {
		display: grid;
		gap: 1rem;
		padding: 1.1rem;
		border-radius: 1rem;
		border: 1px solid color-mix(in oklab, var(--foreground) 10%, transparent);
		background: var(--background);
		box-shadow: 0 30px 70px -40px rgb(0 0 0 / 0.35);
		font-size: 0.8125rem;
		line-height: 1.35;
		text-align: left;
	}
	.box {
		display: grid;
		gap: 0.4rem;
		padding: 0.6rem 0.75rem;
		border-radius: 0.75rem;
		border: 1px solid var(--border);
		background: color-mix(in oklab, var(--foreground) 2.5%, var(--background));
	}
	.label {
		font-size: 0.6875rem;
		font-weight: 500;
		color: var(--muted-foreground);
	}
	.tokens {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
		min-height: 1.6rem;
		font-family: ui-monospace, 'SF Mono', Menlo, monospace;
		font-size: 0.75rem;
	}
	.token {
		padding: 0.15rem 0.45rem;
		border-radius: 0.4rem;
		animation: pop 0.25s ease-out both;
	}
	.token.github {
		background: color-mix(in oklab, var(--foreground) 7%, transparent);
	}
	.token.hush {
		background: color-mix(in oklab, var(--signal-review) 16%, transparent);
		color: var(--signal-review);
	}
	.caret {
		width: 1.5px;
		height: 1rem;
		background: var(--foreground);
		animation: blink 1s steps(1) infinite;
	}
	.caret.done {
		opacity: 0;
		animation: none;
	}
	.flow {
		display: grid;
		gap: 0.6rem;
		opacity: 0.35;
		transition: opacity 0.4s var(--ease, ease);
	}
	.flow.on {
		opacity: 1;
	}
	.step {
		position: relative;
		display: grid;
		grid-template-columns: 7.5rem minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.75rem;
		padding: 0.55rem 0.75rem;
		overflow: hidden;
		border-radius: 0.7rem;
		border: 1px solid var(--border);
	}
	.who {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-weight: 550;
	}
	.who svg {
		width: 14px;
		height: 14px;
		fill: currentColor;
	}
	.hush .who {
		color: var(--signal-review);
	}
	code {
		overflow: hidden;
		font-family: ui-monospace, 'SF Mono', Menlo, monospace;
		font-size: 0.7rem;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--muted-foreground);
	}
	.count {
		font-size: 0.75rem;
		color: var(--muted-foreground);
		white-space: nowrap;
	}
	.count b {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--foreground);
		font-variant-numeric: tabular-nums;
	}
	.bar {
		position: absolute;
		left: 0;
		bottom: 0;
		height: 2px;
		width: 0;
		background: var(--foreground);
		opacity: 0.25;
		transition: width 0.9s var(--ease, ease) 0.15s;
	}
	.hush .bar {
		background: var(--signal-review);
		opacity: 0.8;
	}
	.on .bar {
		width: var(--fill);
	}
	.rows {
		display: grid;
		margin-top: 0.15rem;
	}
	.rows li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.6rem;
		padding: 0.45rem 0.25rem;
		border-top: 1px solid var(--border);
	}
	.rows .t {
		overflow: hidden;
		font-weight: 500;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.rows .size {
		font-size: 0.6875rem;
		color: var(--muted-foreground);
		font-variant-numeric: tabular-nums;
	}
	.rows .more {
		display: block;
		font-size: 0.75rem;
		color: var(--muted-foreground);
	}
	@keyframes pop {
		from {
			opacity: 0;
			translate: 0 0.25rem;
		}
	}
	@keyframes blink {
		50% {
			opacity: 0;
		}
	}
	@media (max-width: 36rem) {
		.step {
			grid-template-columns: minmax(0, 1fr) auto;
		}
		.step code {
			grid-column: 1 / -1;
			grid-row: 2;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.token,
		.caret {
			animation: none;
		}
		.flow,
		.bar {
			transition: none;
		}
	}
</style>
