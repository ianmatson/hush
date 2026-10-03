<script lang="ts">
	let {
		title,
		body,
		when = 'now',
		actions = ['Done', 'Snooze 3h']
	}: { title: string; body: string; when?: string; actions?: string[] } = $props();
</script>

<div class="alert">
	<div class="head">
		<img src="/icon.svg" alt="" />
		<span class="app">Hush</span>
		<span class="when">{when}</span>
	</div>
	<p class="title">{title}</p>
	<p class="body">{body}</p>
	{#if actions.length > 0}
		<div class="actions">
			{#each actions as action (action)}
				<span>{action}</span>
			{/each}
		</div>
	{/if}
</div>

<style>
	.alert {
		display: grid;
		gap: 0.2rem;
		width: 100%;
		padding: 0.75rem 0.875rem 0.625rem;
		border-radius: 1.125rem;
		border: 1px solid color-mix(in oklab, var(--foreground) 8%, transparent);
		background: color-mix(in oklab, var(--popover) 88%, var(--muted));
		color: var(--popover-foreground);
		box-shadow:
			0 1px 2px rgb(0 0 0 / 0.06),
			0 18px 40px -16px rgb(0 0 0 / 0.35);
		font-size: 0.75rem;
		line-height: 1.35;
		text-align: left;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: 0.2rem;
		font-size: 0.6875rem;
		color: var(--muted-foreground);
	}
	.head img {
		width: 1rem;
		height: 1rem;
		border-radius: 0.3rem;
	}
	.app {
		font-weight: 600;
		letter-spacing: 0.02em;
		text-transform: uppercase;
	}
	.when {
		margin-left: auto;
	}
	.title {
		font-weight: 600;
	}
	.body {
		color: var(--muted-foreground);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.actions {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		gap: 0.375rem;
		margin-top: 0.5rem;
	}
	.actions span {
		padding: 0.35rem 0;
		border-radius: 0.6rem;
		background: color-mix(in oklab, var(--foreground) 7%, transparent);
		font-weight: 500;
		text-align: center;
	}
</style>
