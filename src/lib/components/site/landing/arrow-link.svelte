<script lang="ts">
	import type { Snippet } from 'svelte';

	let { href, rel, children }: { href: string; rel?: string; children: Snippet } = $props();
</script>

<a class="link" {href} {rel}>{@render children()} <span aria-hidden="true">→</span></a>

<style>
	.link {
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--foreground);
		text-decoration: underline;
		text-decoration-color: color-mix(in oklab, currentColor 25%, transparent);
		text-underline-offset: 0.3em;
		transition: text-decoration-color 0.2s;
	}
	.link span {
		display: inline-block;
		transition: translate 0.25s var(--ease);
	}
	.link:hover {
		text-decoration-color: currentColor;
	}
	.link:hover span {
		translate: 0.2rem 0;
	}
	.link:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 3px;
		border-radius: 0.375rem;
	}
	.link::selection,
	.link span::selection {
		background: color-mix(in oklab, var(--signal-review) 30%, transparent);
	}
</style>
