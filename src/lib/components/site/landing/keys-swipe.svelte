<script lang="ts">
	import AlarmClock from '@lucide/svelte/icons/alarm-clock';
	import MockAvatar from './mock-avatar.svelte';
	import { DEMO_GH } from './demo-data';

	const KEYS = [
		{ cap: 'J', does: 'Next' },
		{ cap: 'K', does: 'Previous' },
		{ cap: 'Space', does: 'Peek', wide: true },
		{ cap: 'S', does: 'Snooze' },
		{ cap: 'M', does: 'Mute' },
		{ cap: 'U', does: 'Unread' },
		{ cap: '⌘K', does: 'Search', wide: true }
	];
</script>

<div class="keys-swipe" aria-hidden="true">
	<div class="caps">
		{#each KEYS as key (key.cap)}
			<span class="key" class:wide={key.wide}>
				<kbd>{key.cap}</kbd>
				<span>{key.does}</span>
			</span>
		{/each}
	</div>
	<div class="swipe">
		<span class="under"><AlarmClock size={15} /> Snooze</span>
		<span class="row">
			<MockAvatar person={DEMO_GH.ivanagas} size={1.375} />
			<span class="line">
				<span class="t">Add filters to customer stories</span>
				<span class="r">posthog.com#20700 · @ivanagas replied</span>
			</span>
		</span>
	</div>
</div>

<style>
	.keys-swipe {
		display: grid;
		gap: 1.25rem;
		font-size: 0.8125rem;
		text-align: left;
	}
	.caps {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.key {
		display: grid;
		justify-items: center;
		gap: 0.35rem;
		font-size: 0.6875rem;
		color: var(--muted-foreground);
	}
	kbd {
		display: grid;
		place-items: center;
		min-width: 2.75rem;
		height: 2.75rem;
		padding: 0 0.6rem;
		border-radius: 0.6rem;
		border: 1px solid color-mix(in oklab, var(--foreground) 14%, transparent);
		border-bottom-width: 3px;
		background: var(--background);
		font: inherit;
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--foreground);
	}
	.key.wide kbd {
		min-width: 4.5rem;
	}
	.swipe {
		position: relative;
		overflow: hidden;
		border-radius: 0.875rem;
		background: var(--signal-warn);
	}
	.under {
		position: absolute;
		inset: 0 auto 0 1rem;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-weight: 600;
		color: oklch(0.99 0 0);
	}
	:global(.dark) .under {
		color: oklch(0.18 0 0);
	}
	.row {
		position: relative;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: 0.625rem;
		padding: 0.7rem 0.875rem;
		border: 1px solid var(--border);
		border-radius: 0.875rem;
		background: var(--background);
		animation: swipe 6s cubic-bezier(0.65, 0, 0.35, 1) infinite;
	}
	.line {
		display: grid;
		min-width: 0;
	}
	.t {
		overflow: hidden;
		font-weight: 500;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.r {
		font-size: 0.6875rem;
		color: var(--muted-foreground);
	}
	@keyframes swipe {
		0%,
		20% {
			translate: 0 0;
		}
		38%,
		62% {
			translate: 6rem 0;
		}
		80%,
		100% {
			translate: 0 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.row {
			animation: none;
			translate: 6rem 0;
		}
	}
</style>
