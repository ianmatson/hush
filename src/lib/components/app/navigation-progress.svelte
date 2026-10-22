<script lang="ts">
	import { navigating } from '$app/state';

	const SHOW_AFTER_MS = 150;

	let slow = $state(false);
	$effect(() => {
		if (!navigating.to) {
			slow = false;
			return;
		}
		const timer = setTimeout(() => (slow = true), SHOW_AFTER_MS);
		return () => clearTimeout(timer);
	});
</script>

{#if slow}
	<div
		role="progressbar"
		aria-label="Loading the page"
		class="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden"
	>
		<div
			class="h-full w-1/3 animate-navigation-progress bg-primary motion-reduce:w-full motion-reduce:animate-pulse"
		></div>
	</div>
{/if}
