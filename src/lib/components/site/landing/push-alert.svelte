<script lang="ts">
	interface AlertAction {
		label: string;
		run?: () => void;
	}

	let {
		title,
		body,
		when = 'now',
		actions = [],
		onopen
	}: {
		title: string;
		body: string;
		when?: string;
		actions?: AlertAction[];
		onopen?: () => void;
	} = $props();
</script>

<div class="alert">
	<div class="head">
		<img src="/icon.svg" alt="" />
		<span class="app">Hush</span>
		<span class="when">{when}</span>
	</div>
	{#if onopen}
		<button type="button" class="open" onclick={onopen}>
			<span class="title">{title}</span>
			<span class="body">{body}</span>
		</button>
	{:else}
		<p class="title">{title}</p>
		<p class="body">{body}</p>
	{/if}
	{#if actions.length > 0}
		<div class="actions">
			{#each actions as action (action.label)}
				{#if action.run}
					<button type="button" onclick={action.run}>{action.label}</button>
				{:else}
					<span>{action.label}</span>
				{/if}
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
	.open {
		display: grid;
		gap: 0.2rem;
		min-width: 0;
		margin: -0.25rem -0.375rem;
		padding: 0.25rem 0.375rem;
		border-radius: 0.5rem;
		text-align: left;
		cursor: pointer;
	}
	.open:hover {
		background: color-mix(in oklab, var(--foreground) 5%, transparent);
	}
	.title {
		font-weight: 600;
	}
	.body {
		overflow: hidden;
		color: var(--muted-foreground);
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
	.actions > * {
		padding: 0.35rem 0;
		border-radius: 0.6rem;
		background: color-mix(in oklab, var(--foreground) 7%, transparent);
		font-weight: 500;
		text-align: center;
	}
	.actions button {
		cursor: pointer;
		transition: background 0.15s;
	}
	.actions button:hover {
		background: color-mix(in oklab, var(--foreground) 13%, transparent);
	}
	.open:focus-visible,
	.actions button:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}
</style>
