<script lang="ts">
	/**
	 * Whose turn: two lanes, you and a reviewer. The turn moves between them like a token, one
	 * step of the pull request at a time, and the lane that has it lights up. CSS only.
	 */
	// Four stops on a zigzag of equal steps (so each move takes the same time).
	const STOPS = [
		{ x: 72, lane: 'them', label: 'review' },
		{ x: 144, lane: 'you', label: 'changes' },
		{ x: 216, lane: 'them', label: 're-review' },
		{ x: 288, lane: 'you', label: 'merge' }
	] as const;
	const Y = { them: 28, you: 100 };
	const path = `M ${STOPS.map((s) => `${s.x} ${Y[s.lane]}`).join(' L ')}`;
</script>

<div class="lanes" aria-hidden="true">
	<div class="board">
		<span class="lane them"><span class="who" style:--hue="150">AL</span></span>
		<span class="lane you"><span class="who" style:--hue="256">You</span></span>
		<svg viewBox="0 0 304 128" width="304" height="128">
			<path d={path} />
		</svg>
		{#each STOPS as s, i (s.x)}
			<span class="stop" style:left="{s.x}px" style:top="{Y[s.lane]}px" style:--i={i}></span>
			<span
				class="step"
				class:below={s.lane === 'you'}
				style:left="{s.x}px"
				style:top="{Y[s.lane]}px"
				style:--i={i}>{s.label}</span
			>
		{/each}
		<span class="token" style:offset-path="path('{path}')"></span>
	</div>
	<div class="status">
		<span style:--i="0">Alice’s turn · review</span>
		<span style:--i="1">Your turn · changes requested</span>
		<span style:--i="2">Alice’s turn · re-review</span>
		<span style:--i="3" class="done">Your turn · approved, merge it</span>
	</div>
</div>

<style>
	.lanes {
		--loop: 10s;
		--ease: cubic-bezier(0.65, 0, 0.35, 1);
		display: grid;
		justify-items: center;
		gap: 1rem;
		padding: 1.25rem 1rem;
		border-radius: 0.875rem;
		border: 1px solid var(--border);
		background: var(--background);
	}
	.board {
		position: relative;
		width: 304px;
		height: 128px;
	}
	.lane {
		position: absolute;
		left: 2.75rem;
		right: 0;
		height: 1px;
		background: var(--border);
	}
	/* The person of the lane, at its start; it lights up while the lane has the turn. */
	.who {
		position: absolute;
		left: -2.75rem;
		top: 50%;
		translate: 0 -50%;
		display: grid;
		place-items: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 999px;
		font-size: 0.6875rem;
		font-weight: 600;
		color: oklch(0.35 0.08 var(--hue));
		background: oklch(0.93 0.04 var(--hue));
		box-shadow: 0 0 0 0 transparent;
		animation: lit var(--loop) infinite;
	}
	:global(.dark) .who {
		color: oklch(0.92 0.06 var(--hue));
		background: oklch(0.32 0.07 var(--hue));
	}
	.lane.them {
		top: 28px;
	}
	.lane.you {
		top: 100px;
	}
	/* Alice has the turn at stops 1 and 3; you at stops 2 and 4. */
	.lane.them .who {
		animation-delay: calc(var(--loop) * -0.75);
	}
	svg {
		position: absolute;
		inset: 0;
		overflow: visible;
	}
	path {
		fill: none;
		stroke: var(--border);
		stroke-width: 1.5;
		stroke-dasharray: 3 4;
	}
	.stop {
		position: absolute;
		width: 7px;
		height: 7px;
		margin: -3.5px 0 0 -3.5px;
		border-radius: 999px;
		background: var(--border);
	}
	.step {
		position: absolute;
		translate: -50% calc(-100% - 0.625rem);
		font-size: 0.6875rem;
		color: var(--muted-foreground);
		white-space: nowrap;
	}
	.step.below {
		translate: -50% 0.625rem;
	}
	.token {
		position: absolute;
		top: 0;
		left: 0;
		width: 14px;
		height: 14px;
		border-radius: 999px;
		background: var(--signal-review);
		box-shadow:
			0 0 0 4px color-mix(in oklch, var(--signal-review) 22%, transparent),
			0 0 18px var(--signal-review);
		offset-rotate: 0deg;
		animation: move var(--loop) var(--ease) infinite;
	}
	.status {
		display: grid;
		font-size: 0.8125rem;
	}
	.status span {
		grid-area: 1 / 1;
		text-align: center;
		opacity: 0;
		animation: say var(--loop) infinite;
		animation-delay: calc(var(--i) * var(--loop) / 4);
	}
	.status .done {
		color: var(--signal-merge);
	}
	/* Four stops, a quarter of the loop each: hold, then move to the next one. */
	@keyframes move {
		0% {
			offset-distance: 0%;
			opacity: 0;
			background: var(--signal-review);
		}
		3%,
		17% {
			offset-distance: 0%;
			opacity: 1;
			background: var(--signal-review);
		}
		25%,
		42% {
			offset-distance: 33.333%;
			background: var(--signal-review);
		}
		50%,
		67% {
			offset-distance: 66.667%;
			background: var(--signal-review);
			box-shadow:
				0 0 0 4px color-mix(in oklch, var(--signal-review) 22%, transparent),
				0 0 18px var(--signal-review);
		}
		75%,
		92% {
			offset-distance: 100%;
			background: var(--signal-merge);
			box-shadow:
				0 0 0 4px color-mix(in oklch, var(--signal-merge) 22%, transparent),
				0 0 18px var(--signal-merge);
		}
		100% {
			offset-distance: 100%;
			opacity: 0;
		}
	}
	/* A lane label is lit while its lane has the turn: every other quarter. */
	@keyframes lit {
		0%,
		20%,
		50%,
		70%,
		100% {
			box-shadow: 0 0 0 0 transparent;
			opacity: 0.55;
		}
		25%,
		45%,
		75%,
		95% {
			box-shadow:
				0 0 0 2px var(--background),
				0 0 0 3.5px oklch(0.65 0.14 var(--hue));
			opacity: 1;
		}
	}
	@keyframes say {
		0% {
			opacity: 0;
			filter: blur(3px);
		}
		4%,
		21% {
			opacity: 1;
			filter: blur(0);
		}
		25%,
		100% {
			opacity: 0;
			filter: blur(3px);
		}
	}
	/* Small phones: the drawing has a fixed size (the token's path is in px), so scale it. */
	@media (max-width: 24rem) {
		.board {
			zoom: 0.84;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.token,
		.who,
		.status span {
			animation: none;
		}
		.token {
			offset-distance: 33.333%;
		}
		.status span:nth-child(2) {
			opacity: 1;
		}
	}
</style>
