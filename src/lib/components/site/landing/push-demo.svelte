<script lang="ts">
	/** A push that arrives, then quietly turns into "✓ You approved" and goes away. */
</script>

<div class="phone" aria-hidden="true">
	<span class="time">9:41</span>
	<div class="slot">
		<div class="push first">
			<img src="/icon.svg" alt="" />
			<div class="grid">
				<span class="app">Hush · now</span>
				<span class="t">Review requested</span>
				<span class="b">feat: faster dashboards · posthog#4821</span>
			</div>
		</div>
		<div class="push second">
			<img src="/icon.svg" alt="" />
			<div class="grid">
				<span class="app">Hush · now</span>
				<span class="t">✓ You approved</span>
				<span class="b">It closes by itself.</span>
			</div>
		</div>
	</div>
	<div class="quiet">
		<span class="moon"></span>Quiet 22:00–07:00 · held alerts arrive as one
	</div>
</div>

<style>
	.phone {
		--loop: 8s;
		position: relative;
		display: grid;
		justify-items: center;
		gap: 1.5rem;
		padding: 2rem 1.25rem 1.5rem;
		border-radius: 1.25rem;
		border: 1px solid var(--border);
		background:
			radial-gradient(
				90% 70% at 50% 0%,
				color-mix(in oklch, var(--signal-reply) 9%, transparent),
				transparent
			),
			var(--background);
	}
	.time {
		font-size: 2.75rem;
		font-weight: 300;
		letter-spacing: -0.04em;
		line-height: 1;
	}
	.slot {
		display: grid;
		width: 100%;
		min-height: 4.75rem;
	}
	.push {
		grid-area: 1 / 1;
		display: flex;
		gap: 0.75rem;
		align-items: center;
		padding: 0.75rem 0.875rem;
		border-radius: 1.125rem;
		background: color-mix(in oklch, var(--muted) 80%, transparent);
		backdrop-filter: blur(12px);
		opacity: 0;
		animation: var(--loop) cubic-bezier(0.2, 0.8, 0.2, 1) infinite;
	}
	.push img {
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 0.625rem;
	}
	.app {
		font-size: 0.6875rem;
		color: var(--muted-foreground);
	}
	.t {
		font-size: 0.875rem;
		font-weight: 600;
	}
	.b {
		font-size: 0.8125rem;
		color: var(--muted-foreground);
	}
	.first {
		animation-name: arrive;
	}
	.second {
		animation-name: resolve;
	}
	.quiet {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: var(--muted-foreground);
	}
	.moon {
		width: 0.75rem;
		height: 0.75rem;
		border-radius: 999px;
		box-shadow: inset -0.2rem -0.1rem 0 0 var(--signal-warn);
	}
	@keyframes arrive {
		0% {
			opacity: 0;
			transform: translateY(-1rem) scale(0.96);
		}
		8%,
		42% {
			opacity: 1;
			transform: none;
		}
		50%,
		100% {
			opacity: 0;
			transform: scale(0.98);
			filter: blur(4px);
		}
	}
	@keyframes resolve {
		0%,
		44% {
			opacity: 0;
			filter: blur(4px);
		}
		52%,
		76% {
			opacity: 1;
			filter: blur(0);
			transform: none;
		}
		88%,
		100% {
			opacity: 0;
			transform: translateY(-0.75rem) scale(0.96);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.push {
			animation: none;
		}
		.first {
			opacity: 1;
		}
	}
</style>
