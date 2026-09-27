<script lang="ts">
	/** Whose turn: the turn passes between people on one pull request, like a baton. */
	const PEOPLE = [
		{ initials: 'You', hue: 256 },
		{ initials: 'AL', hue: 150 },
		{ initials: 'BO', hue: 25 }
	];
	const STATES = ['Your turn · review', 'Alice’s turn · address review', 'Your turn · approve'];
</script>

<div class="card" aria-hidden="true">
	<div class="head">
		<span class="dot"></span>
		<div class="grid gap-0.5">
			<span class="title">feat: faster dashboards</span>
			<span class="meta">posthog#4821 · 3 checks passing</span>
		</div>
	</div>
	<div class="people">
		<span class="ring"></span>
		{#each PEOPLE as p (p.initials)}
			<span class="avatar" style:--hue={p.hue}>{p.initials}</span>
		{/each}
	</div>
	<div class="states">
		{#each STATES as s, i (s)}
			<span class="state" style:--i={i}>{s}</span>
		{/each}
	</div>
</div>

<style>
	.card {
		--loop: 9s;
		display: grid;
		gap: 1.25rem;
		padding: 1.25rem;
		border-radius: 0.875rem;
		border: 1px solid var(--border);
		background: var(--background);
	}
	.head {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
	}
	.dot {
		margin-top: 0.3rem;
		width: 0.625rem;
		height: 0.625rem;
		border-radius: 999px;
		background: var(--signal-merge);
		box-shadow: 0 0 0 4px color-mix(in oklch, var(--signal-merge) 18%, transparent);
	}
	.title {
		font-weight: 500;
		font-size: 0.9375rem;
	}
	.meta {
		font-size: 0.75rem;
		color: var(--muted-foreground);
	}
	.people {
		position: relative;
		display: flex;
		gap: 1rem;
	}
	.avatar {
		position: relative;
		display: grid;
		place-items: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 999px;
		font-size: 0.6875rem;
		font-weight: 600;
		color: oklch(0.3 0.08 var(--hue));
		background: oklch(0.92 0.05 var(--hue));
	}
	:global(.dark) .avatar {
		color: oklch(0.92 0.06 var(--hue));
		background: oklch(0.32 0.08 var(--hue));
	}
	.ring {
		position: absolute;
		left: -0.25rem;
		top: -0.25rem;
		width: 3rem;
		height: 3rem;
		border-radius: 999px;
		border: 1.5px solid var(--signal-review);
		box-shadow: 0 0 24px -4px var(--signal-review);
		animation: pass var(--loop) cubic-bezier(0.65, 0, 0.35, 1) infinite;
	}
	.states {
		display: grid;
		font-size: 0.8125rem;
	}
	.state {
		grid-area: 1 / 1;
		color: var(--muted-foreground);
		opacity: 0;
		animation: say var(--loop) infinite;
		animation-delay: calc(var(--i) * var(--loop) / 3);
	}
	/* You → Alice → you again: 3 stops, one third of the loop each. */
	@keyframes pass {
		0%,
		26% {
			translate: 0 0;
		}
		33%,
		59% {
			translate: 3.5rem 0;
		}
		66%,
		92% {
			translate: 0 0;
			border-color: var(--signal-merge);
			box-shadow: 0 0 24px -4px var(--signal-merge);
		}
		100% {
			translate: 0 0;
		}
	}
	@keyframes say {
		0% {
			opacity: 0;
			translate: 0 0.375rem;
			filter: blur(3px);
		}
		4%,
		28% {
			opacity: 1;
			translate: 0 0;
			filter: blur(0);
		}
		33%,
		100% {
			opacity: 0;
			translate: 0 -0.375rem;
			filter: blur(3px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.ring,
		.state {
			animation: none;
		}
		.state:first-child {
			opacity: 1;
		}
	}
</style>
