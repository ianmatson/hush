<script lang="ts">
	/** One line of text is a rule: it types itself, and the conditions it means light up. */
	const QUERY = 'author:dependabot* is:merged';
	const PARTS = [
		{ label: 'Author', value: 'dependabot*' },
		{ label: 'State', value: 'merged' },
		{ label: 'Then', value: 'Move to Done' }
	];
</script>

<div class="card" aria-hidden="true">
	<div class="input">
		<span class="prompt">rule</span>
		<span class="typed" style:--n={QUERY.length}>{QUERY}</span>
	</div>
	<div class="parts">
		{#each PARTS as p, i (p.label)}
			<span class="part" style:--i={i}><span class="l">{p.label}</span>{p.value}</span>
		{/each}
	</div>
</div>

<style>
	.card {
		--loop: 9s;
		display: grid;
		gap: 1rem;
		padding: 1.25rem;
		border-radius: 0.875rem;
		border: 1px solid var(--border);
		background: var(--background);
	}
	.input {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 0.75rem;
		border-radius: 0.75rem;
		background: var(--muted);
		font-family: ui-monospace, 'SF Mono', Menlo, monospace;
		font-size: 0.8125rem;
		overflow: hidden;
	}
	.prompt {
		color: var(--muted-foreground);
	}
	.typed {
		display: inline-block;
		width: 0;
		overflow: hidden;
		white-space: nowrap;
		border-right: 2px solid var(--signal-review);
		animation:
			type var(--loop) steps(var(--n)) infinite,
			caret 0.9s steps(1) infinite;
	}
	.parts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.part {
		display: inline-flex;
		gap: 0.375rem;
		padding: 0.3125rem 0.625rem;
		border-radius: 999px;
		border: 1px solid var(--border);
		font-size: 0.75rem;
		opacity: 0;
		animation: show var(--loop) infinite;
		animation-delay: calc(var(--i) * 0.5s);
	}
	.part:last-child {
		border-color: color-mix(in oklch, var(--signal-merge) 50%, transparent);
		background: color-mix(in oklch, var(--signal-merge) 10%, transparent);
	}
	.part .l {
		color: var(--muted-foreground);
	}
	@keyframes type {
		0% {
			width: 0;
		}
		45%,
		90% {
			width: calc(var(--n) * 1ch + 2px);
		}
		100% {
			width: 0;
		}
	}
	@keyframes caret {
		50% {
			border-color: transparent;
		}
	}
	@keyframes show {
		0%,
		44% {
			opacity: 0;
			translate: 0 0.375rem;
			filter: blur(3px);
		}
		52%,
		86% {
			opacity: 1;
			translate: 0 0;
			filter: blur(0);
		}
		94%,
		100% {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.typed,
		.part {
			animation: none;
		}
		.typed {
			width: auto;
			border: 0;
		}
		.part {
			opacity: 1;
		}
	}
</style>
