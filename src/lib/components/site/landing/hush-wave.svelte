<script lang="ts">
	/**
	 * The hero: sound to silence. On the left, everything GitHub sends, as a loud waveform. At the
	 * hush line it goes almost flat; only three peaks stay: your turn. CSS only.
	 */
	const N = 88;
	const HUSH = 0.5;
	/** The same "random" numbers on every build (the page is prerendered). */
	const rnd = (i: number) => {
		const x = Math.sin(i * 12.9898) * 43758.5453;
		return x - Math.floor(x);
	};
	const PEAKS: Record<number, { label: string; signal: string; h: number }> = {
		58: { label: 'Review', signal: 'var(--signal-review)', h: 0.62 },
		70: { label: 'Fix CI', signal: 'var(--signal-fail)', h: 0.78 },
		80: { label: 'Reply', signal: 'var(--signal-reply)', h: 0.54 }
	};
	const bars = Array.from({ length: N }, (_, i) => {
		const p = i / (N - 1);
		const peak = PEAKS[i];
		// Loud before the line, a soft fade over it, and almost nothing after it.
		const loud = Math.min(1, Math.max(0, (HUSH + 0.06 - p) / 0.12));
		const h = peak ? peak.h : 0.05 + loud * (0.25 + rnd(i) * 0.75) + (1 - loud) * rnd(i + 7) * 0.05;
		return {
			h,
			peak,
			dur: 0.7 + rnd(i + 3) * 1.1,
			delay: -rnd(i + 11) * 2,
			quiet: !peak && loud < 0.5
		};
	});
</script>

<figure
	class="wave"
	aria-label="A loud waveform of notifications goes quiet at the hush line; three peaks stay: review, fix CI, and reply"
>
	<div class="bars" aria-hidden="true">
		{#each bars as b, i (i)}
			<span
				class="bar"
				class:quiet={b.quiet}
				class:peak={b.peak}
				style:--h={b.h}
				style:--dur="{b.dur}s"
				style:--delay="{b.delay}s"
				style:--signal={b.peak?.signal}
			>
				{#if b.peak}<span class="label">{b.peak.label}</span>{/if}
			</span>
		{/each}
		<span class="hush" style:--at="{HUSH * 100}%"><span>hush</span></span>
	</div>
	<figcaption aria-hidden="true">
		<span>Everything GitHub sends</span>
		<span>Your turn</span>
	</figcaption>
</figure>

<style>
	.wave {
		display: grid;
		gap: 1rem;
	}
	.bars {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 2px;
		height: clamp(10rem, 22vw, 17rem);
	}
	.bar {
		position: relative;
		flex: 1;
		max-width: 0.5rem;
		height: calc(var(--h) * 100%);
		border-radius: 999px;
		background: var(--foreground);
		opacity: 0.85;
		transform-origin: center;
		animation: talk var(--dur) ease-in-out var(--delay) infinite alternate;
	}
	.bar.quiet {
		opacity: 0.22;
		animation-name: breath;
	}
	.bar.peak {
		opacity: 1;
		background: var(--signal);
		box-shadow: 0 0 22px -2px var(--signal);
		animation: pulse 3.2s ease-in-out var(--delay) infinite;
	}
	.label {
		position: absolute;
		bottom: calc(100% + 0.625rem);
		left: 50%;
		translate: -50% 0;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		white-space: nowrap;
		color: var(--signal);
	}
	.hush {
		position: absolute;
		top: -0.5rem;
		bottom: -0.5rem;
		left: var(--at);
		width: 1px;
		background: linear-gradient(
			to bottom,
			transparent,
			color-mix(in oklch, var(--foreground) 45%, transparent) 20%,
			color-mix(in oklch, var(--foreground) 45%, transparent) 80%,
			transparent
		);
	}
	.hush span {
		position: absolute;
		bottom: -1.25rem;
		left: 50%;
		translate: -50% 0;
		font-family: var(--serif, Georgia, serif);
		font-style: italic;
		font-size: 1rem;
	}
	figcaption {
		display: flex;
		justify-content: space-between;
		font-size: 0.8125rem;
		color: var(--muted-foreground);
		padding-top: 0.75rem;
	}
	@keyframes talk {
		from {
			transform: scaleY(0.25);
		}
		to {
			transform: scaleY(1);
		}
	}
	@keyframes breath {
		from {
			transform: scaleY(0.6);
		}
		to {
			transform: scaleY(1);
		}
	}
	@keyframes pulse {
		50% {
			transform: scaleY(0.9);
			box-shadow: 0 0 30px 0 var(--signal);
		}
	}
	@media (max-width: 40rem) {
		.bars {
			gap: 1px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.bar {
			animation: none;
			transform: scaleY(0.7);
		}
		.bar.peak {
			transform: none;
		}
	}
</style>
