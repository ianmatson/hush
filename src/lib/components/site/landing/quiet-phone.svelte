<script lang="ts">
	import Moon from '@lucide/svelte/icons/moon';
	import PushAlert from './push-alert.svelte';
</script>

<div class="phone" aria-hidden="true">
	<div class="screen">
		<p class="date">Monday 5 October</p>
		<p class="time">7:00</p>
		<p class="quiet"><Moon size={12} /> Quiet hours ended</p>
		<div class="stack">
			<PushAlert
				title="4 alerts while quiet"
				body="@joethreepwood requests your review, and 3 more"
				actions={[]}
			/>
			<span class="behind"></span>
		</div>
	</div>
</div>

<style>
	.phone {
		width: 17rem;
		padding: 0.6rem;
		border-radius: 2.75rem;
		background: oklch(0.12 0.01 265);
		box-shadow:
			inset 0 0 0 1px oklch(1 0 0 / 0.12),
			0 40px 80px -30px rgb(0 0 0 / 0.7);
	}
	.screen {
		display: grid;
		justify-items: center;
		align-content: start;
		height: 30rem;
		padding: 2.75rem 0.75rem 0;
		border-radius: 2.2rem;
		background:
			radial-gradient(120% 70% at 20% 0%, oklch(0.42 0.09 265 / 0.85), transparent 60%),
			radial-gradient(90% 60% at 100% 100%, oklch(0.38 0.1 150 / 0.6), transparent 60%),
			oklch(0.2 0.03 265);
		color: oklch(0.97 0 0);
	}
	.date {
		font-size: 0.8125rem;
		font-weight: 500;
		opacity: 0.85;
	}
	.time {
		font-size: 4.25rem;
		font-weight: 600;
		line-height: 1;
		letter-spacing: -0.04em;
		font-variant-numeric: tabular-nums;
	}
	.quiet {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		margin: 0.6rem 0 auto;
		font-size: 0.6875rem;
		opacity: 0.75;
	}
	.stack {
		position: relative;
		width: 100%;
		margin-top: 7.5rem;
	}
	.stack :global(.alert) {
		position: relative;
		z-index: 1;
	}
	.behind {
		position: absolute;
		inset: auto 0.6rem -0.4rem;
		height: 2rem;
		border-radius: 1rem;
		background: oklch(1 0 0 / 0.18);
	}
</style>
