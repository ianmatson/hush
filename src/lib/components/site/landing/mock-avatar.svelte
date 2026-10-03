<script lang="ts">
	import type { MockPerson } from './mock';

	let { person, size = 1.75 }: { person: MockPerson; size?: number } = $props();
</script>

<span class="avatar" style:--hue={person.hue} style:--size="{size}rem">{person.initials}</span>

<style>
	.avatar {
		display: inline-grid;
		flex: none;
		place-items: center;
		width: var(--size);
		height: var(--size);
		border-radius: 999px;
		font-size: calc(var(--size) * 0.36);
		font-weight: 600;
		letter-spacing: 0.01em;
		color: oklch(0.36 0.09 var(--hue));
		background: oklch(0.92 0.05 var(--hue));
	}
	:global(.dark) .avatar {
		color: oklch(0.92 0.06 var(--hue));
		background: oklch(0.34 0.08 var(--hue));
	}
</style>
