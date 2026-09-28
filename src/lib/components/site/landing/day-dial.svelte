<script lang="ts">
	/**
	 * A day of notifications on a 24-hour dial. The hand sweeps like a radar: each notification
	 * shows as the hand passes its hour. What becomes your turn buzzes (a ripple); updates stay silent. At
	 * night nothing buzzes; at 07:00 one ripple goes out for all of it. CSS only.
	 */
	type Dot = { h: number; need?: boolean; r: number };
	const DOTS: Dot[] = [
		{ h: 8.5, r: 0.78 },
		{ h: 9.3, need: true, r: 0.62 },
		{ h: 10.4, r: 0.86 },
		{ h: 11.2, r: 0.7 },
		{ h: 12.6, r: 0.8 },
		{ h: 13.5, need: true, r: 0.66 },
		{ h: 14.8, r: 0.88 },
		{ h: 15.6, r: 0.72 },
		{ h: 16.7, need: true, r: 0.8 },
		{ h: 18.2, r: 0.64 },
		{ h: 19.5, r: 0.84 },
		{ h: 23.1, need: true, r: 0.7 },
		{ h: 1.4, r: 0.82 },
		{ h: 3.2, need: true, r: 0.64 },
		{ h: 5.1, r: 0.76 }
	];
	const NIGHT_FROM = 22;
	const NIGHT_TO = 7;
	const night = (h: number) => h >= NIGHT_FROM || h < NIGHT_TO;
</script>

<div class="wrap" aria-hidden="true">
	<div class="dial">
		<span class="night"></span>
		<span class="sweep"></span>
		{#each [0, 6, 12, 18] as h (h)}
			<span class="tick" style:--a="{h * 15}deg"><span>{String(h).padStart(2, '0')}</span></span>
		{/each}
		{#each DOTS as d (d.h)}
			<span class="pos" style:--a="{d.h * 15}deg" style:--r={d.r}>
				<span class="dot" class:need={d.need} class:held={d.need && night(d.h)} style:--t={d.h / 24}
				></span>
			</span>
		{/each}
		<span class="pos" style:--a="{NIGHT_TO * 15}deg" style:--r="0.9">
			<span class="morning" style:--t={NIGHT_TO / 24}></span>
		</span>
		<span class="hand"></span>
		<span class="moon"></span>
	</div>
	<div class="legend">
		<span><i class="need"></i>buzz</span>
		<span><i></i>silent</span>
		<span><i class="held"></i>held until 07:00</span>
	</div>
</div>

<style>
	.wrap {
		--loop: 12s;
		--size: 13.5rem;
		display: grid;
		justify-items: center;
		gap: 1.25rem;
		padding: 1.5rem 1rem 1.25rem;
		border-radius: 0.875rem;
		border: 1px solid var(--border);
		background: var(--background);
	}
	.dial {
		position: relative;
		width: var(--size);
		height: var(--size);
		border-radius: 999px;
		border: 1px solid var(--border);
	}
	/* 22:00 to 07:00, shaded. 00:00 is at the top. */
	.night {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: conic-gradient(
			color-mix(in oklch, var(--signal-reply) 45%, transparent) 0deg 105deg,
			transparent 105deg 330deg,
			color-mix(in oklch, var(--signal-reply) 45%, transparent) 330deg
		);
		/* A thin band at the rim, not a whole wedge. */
		mask-image: radial-gradient(closest-side, transparent 93%, black 94%);
	}
	/* The radar trail behind the hand. */
	.sweep {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: conic-gradient(
			from -60deg,
			transparent,
			color-mix(in oklch, var(--foreground) 7%, transparent) 60deg,
			transparent 60.5deg
		);
		animation: turn var(--loop) linear infinite;
	}
	.hand {
		position: absolute;
		left: 50%;
		bottom: 50%;
		width: 1.5px;
		height: 50%;
		margin-left: -0.75px;
		background: linear-gradient(to top, transparent, var(--foreground));
		transform-origin: bottom center;
		animation: turn var(--loop) linear infinite;
	}
	.tick {
		position: absolute;
		inset: 0;
		rotate: var(--a);
	}
	.tick::before {
		content: '';
		position: absolute;
		top: 0;
		left: 50%;
		width: 1px;
		height: 0.4rem;
		background: var(--muted-foreground);
	}
	.tick span {
		position: absolute;
		top: 1rem;
		left: 50%;
		translate: -50% 0;
		rotate: calc(-1 * var(--a));
		font-size: 0.625rem;
		color: var(--muted-foreground);
		font-variant-numeric: tabular-nums;
	}
	.moon {
		position: absolute;
		top: 22%;
		left: 58%;
		width: 0.75rem;
		height: 0.75rem;
		border-radius: 999px;
		box-shadow: inset -0.2rem -0.1rem 0 0 var(--signal-reply);
		opacity: 0.8;
	}
	/* A dot at its hour: rotate to the angle, then out along the radius. */
	.pos {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 0;
		height: 0;
		transform: rotate(var(--a)) translateY(calc(var(--size) / -2 * var(--r)));
	}
	.dot,
	.morning {
		position: absolute;
		width: 0.5rem;
		height: 0.5rem;
		margin: -0.25rem;
		border-radius: 999px;
	}
	.dot {
		background: var(--muted-foreground);
		opacity: 0;
		/* The hand reaches this hour at t × loop. */
		animation: appear var(--loop) linear infinite;
		animation-delay: calc(var(--t) * var(--loop) - var(--loop));
	}
	.dot.need {
		background: var(--signal-review);
	}
	.dot.held {
		background: var(--signal-reply);
	}
	/* The buzz: a ripple when the hand passes (not at night). */
	.dot.need:not(.held)::after,
	.morning::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		border: 1.5px solid currentColor;
		opacity: 0;
		animation: ripple var(--loop) ease-out infinite;
		animation-delay: inherit;
	}
	.dot.need:not(.held) {
		color: var(--signal-review);
	}
	.morning {
		width: 0.375rem;
		height: 0.375rem;
		margin: -0.1875rem;
		background: var(--signal-reply);
		color: var(--signal-reply);
		animation-delay: calc(var(--t) * var(--loop) - var(--loop));
	}
	.morning::after {
		animation-name: ripple-big;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.25rem 1rem;
		font-size: 0.75rem;
		color: var(--muted-foreground);
	}
	.legend i {
		display: inline-block;
		width: 0.4375rem;
		height: 0.4375rem;
		margin-right: 0.375rem;
		border-radius: 999px;
		background: var(--muted-foreground);
	}
	.legend i.need {
		background: var(--signal-review);
	}
	.legend i.held {
		background: var(--signal-reply);
	}

	@keyframes turn {
		to {
			rotate: 1turn;
		}
	}
	/* Bright as the hand passes, then fading like a radar echo. */
	@keyframes appear {
		0% {
			opacity: 0;
			scale: 0.4;
		}
		2% {
			opacity: 1;
			scale: 1.25;
		}
		8% {
			scale: 1;
		}
		45% {
			opacity: 0.55;
		}
		80%,
		100% {
			opacity: 0;
		}
	}
	@keyframes ripple {
		0% {
			opacity: 0.9;
			scale: 1;
		}
		12%,
		100% {
			opacity: 0;
			scale: 4;
		}
	}
	@keyframes ripple-big {
		0% {
			opacity: 1;
			scale: 1;
		}
		18%,
		100% {
			opacity: 0;
			scale: 9;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.sweep,
		.hand,
		.dot,
		.dot::after,
		.morning::after {
			animation: none;
		}
		.dot {
			opacity: 0.8;
		}
	}
</style>
