<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import MockAvatar from './mock-avatar.svelte';
	import PushAlert from './push-alert.svelte';
	import { DEMO_GH } from './demo-data';

	const DRAFT = 'Thanks for the cross-links, @r';
	const SUGGESTIONS = [
		{ handle: '@rafaeelaudibert', name: 'Rafael Audibert', person: DEMO_GH.rafaeelaudibert },
		{ handle: '@rubychilds', name: 'ruby childs', person: DEMO_GH.rubychilds }
	];
	const MORE = [
		{ label: 'Request changes', key: '⇧A' },
		{ label: 'Comment', key: '⇧C' },
		{ label: 'Merge', key: '⇧M' },
		{ label: 'Enable auto-merge' },
		{ label: 'Re-run failed jobs', key: '⇧R' },
		{ label: 'Close', key: '⇧X' }
	];
</script>

<div class="stage" aria-hidden="true">
	<div class="peek">
		<div class="top">
			<p class="reason"><b>Your turn:</b> Review requested, for 3h</p>
			<p class="title">Add Juno customer case study and cross-links</p>
			<p class="meta">
				<span class="state">Open</span>
				<span>PostHog/posthog.com#20387</span>
				<span class="ok"><CircleCheck size={13} /> 12 checks passed</span>
			</p>
		</div>

		<div class="thread">
			<div class="comment">
				<MockAvatar person={DEMO_GH.joethreepwood} size={1.5} />
				<div>
					<p class="by"><b>joethreepwood</b> opened this · 3h</p>
					<p>
						Adds a customer case study for Juno, an AI health assistant for people who live with
						chronic illness, with cross-links from the customer pages.
					</p>
					<p class="react"><span>👍 3</span><span>🚀 1</span></p>
				</div>
			</div>
			<div class="event">
				<MockAvatar person={DEMO_GH.cleoPleurodon} size={1.125} />
				<span><b>cleo-pleurodon</b> reviewed these changes</span>
			</div>
		</div>

		<div class="box">
			<div class="input">
				<span class="typed" style:--n={DRAFT.length}>{DRAFT}</span>
				<div class="suggest">
					{#each SUGGESTIONS as s, i (s.handle)}
						<span class:on={i === 0}>
							<MockAvatar person={s.person} size={1.125} />
							<b>{s.handle}</b>
							<span>{s.name}</span>
						</span>
					{/each}
				</div>
			</div>
			<p class="hint"><span>Draft saved</span><span>@ people · # issues · : emoji</span></p>
		</div>

		<div class="bar">
			<span class="ghost">Snooze <kbd>S</kbd></span>
			<span class="ghost mute">Mute <kbd>M</kbd></span>
			<span class="primary">Approve <kbd>A</kbd></span>
			<span class="ghost">More <ChevronDown size={12} /></span>
		</div>

		<div class="toast">
			<span>Approved PostHog/posthog.com#20387</span>
		</div>
	</div>

	<div class="rail">
		<div class="alert">
			<PushAlert
				title="CI failed on your PR"
				body="PostHog/posthog.com#20508 · Add the Forum app at /forum"
			/>
		</div>
		<div class="menu">
			{#each MORE as item (item.label)}
				<span
					><span>{item.label}</span>{#if item.key}<kbd>{item.key}</kbd>{/if}</span
				>
			{/each}
		</div>
	</div>
</div>

<style>
	.stage {
		--loop: 12s;
		--ease: cubic-bezier(0.16, 1, 0.3, 1);
		--rail-overlap: 2.5rem;
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 15rem;
		font-size: 0.8125rem;
		line-height: 1.4;
		text-align: left;
	}
	kbd {
		font: inherit;
		font-size: 0.6875rem;
		color: var(--muted-foreground);
	}

	.peek {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		overflow: hidden;
		border-radius: 1rem;
		border: 1px solid color-mix(in oklab, var(--foreground) 10%, transparent);
		background: var(--background);
		box-shadow:
			0 1px 2px rgb(0 0 0 / 0.05),
			0 40px 90px -40px rgb(0 0 0 / 0.45);
	}
	.top {
		display: grid;
		gap: 0.4rem;
		padding: 1.125rem calc(1.25rem + var(--rail-overlap)) 1rem 1.25rem;
		border-bottom: 1px solid var(--border);
	}
	.reason {
		font-size: 0.75rem;
		color: var(--muted-foreground);
	}
	.reason b {
		font-weight: 600;
		color: var(--signal-review);
	}
	.title {
		font-size: 1.0625rem;
		font-weight: 600;
		line-height: 1.25;
		letter-spacing: -0.01em;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.75rem;
		color: var(--muted-foreground);
	}
	.state {
		padding: 0.05rem 0.5rem;
		border-radius: 999px;
		background: color-mix(in oklab, var(--signal-merge) 16%, transparent);
		color: var(--signal-merge);
		font-weight: 600;
	}
	.ok {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		color: var(--signal-merge);
	}

	.thread {
		display: grid;
		gap: 0.75rem;
		padding: 1rem calc(1.25rem + var(--rail-overlap)) 1rem 1.25rem;
	}
	.comment {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.625rem;
	}
	.comment > div {
		display: grid;
		gap: 0.3rem;
	}
	.by {
		font-size: 0.75rem;
		color: var(--muted-foreground);
	}
	.by b,
	.event b {
		font-weight: 600;
		color: var(--foreground);
	}
	.react {
		display: flex;
		gap: 0.35rem;
	}
	.react span {
		padding: 0.05rem 0.45rem;
		border-radius: 999px;
		border: 1px solid var(--border);
		font-size: 0.6875rem;
	}
	.event {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding-left: 0.2rem;
		font-size: 0.75rem;
		color: var(--muted-foreground);
	}

	.box {
		display: grid;
		gap: 0.4rem;
		padding: 0 calc(1.25rem + var(--rail-overlap)) 1rem 1.25rem;
	}
	.input {
		position: relative;
		min-height: 4.25rem;
		padding: 0.6rem 0.75rem;
		border-radius: 0.625rem;
		border: 1px solid var(--signal-review);
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--signal-review) 16%, transparent);
	}
	.typed {
		display: inline-block;
		overflow: hidden;
		vertical-align: bottom;
		white-space: nowrap;
		width: calc(var(--n) * 1ch);
		border-right: 2px solid var(--signal-review);
		font-family: ui-monospace, 'SF Mono', Menlo, monospace;
		font-size: 0.75rem;
		animation:
			type var(--loop) steps(var(--n)) infinite,
			caret 0.9s steps(1) infinite;
	}
	.suggest {
		position: absolute;
		top: 2.1rem;
		left: min(13.5rem, calc(100% - 13.5rem));
		z-index: 2;
		display: grid;
		min-width: 13rem;
		padding: 0.3rem;
		border-radius: 0.625rem;
		border: 1px solid var(--border);
		background: var(--popover);
		box-shadow: 0 16px 36px -14px rgb(0 0 0 / 0.35);
		font-size: 0.75rem;
		animation: pop var(--loop) var(--ease) infinite;
	}
	.suggest > span {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.3rem 0.45rem;
		border-radius: 0.4rem;
	}
	.suggest b {
		font-weight: 600;
	}
	.suggest span span {
		color: var(--muted-foreground);
	}
	.suggest .on {
		background: color-mix(in oklab, var(--signal-review) 12%, transparent);
	}
	.hint {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		font-size: 0.6875rem;
		color: var(--muted-foreground);
	}

	.bar {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.7rem 0.875rem;
		border-top: 1px solid var(--border);
		font-size: 0.75rem;
	}
	.bar > span {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.35rem 0.6rem;
		border-radius: 0.5rem;
		white-space: nowrap;
	}
	.ghost {
		border: 1px solid var(--border);
	}
	.primary {
		margin-left: auto;
		background: var(--foreground);
		color: var(--background);
		font-weight: 500;
		animation: press var(--loop) var(--ease) infinite;
	}
	.primary kbd {
		color: color-mix(in oklab, var(--background) 65%, transparent);
	}
	.toast {
		position: absolute;
		right: calc(0.875rem + var(--rail-overlap));
		bottom: 3.6rem;
		display: flex;
		align-items: center;
		gap: 0.875rem;
		overflow: hidden;
		padding: 0.55rem 0.875rem 0.65rem;
		border-radius: 0.625rem;
		background: var(--foreground);
		color: var(--background);
		font-size: 0.75rem;
		box-shadow: 0 16px 30px -12px rgb(0 0 0 / 0.4);
		animation: toast var(--loop) var(--ease) infinite;
	}

	.rail {
		position: relative;
		z-index: 1;
		display: grid;
		align-content: space-between;
		gap: 2rem;
		margin-left: calc(var(--rail-overlap) * -1);
		padding: 2.5rem 0 4rem;
	}
	.menu {
		display: grid;
		padding: 0.35rem;
		border-radius: 0.75rem;
		border: 1px solid color-mix(in oklab, var(--foreground) 10%, transparent);
		background: var(--popover);
		box-shadow:
			0 1px 2px rgb(0 0 0 / 0.06),
			0 24px 50px -20px rgb(0 0 0 / 0.4);
		font-size: 0.75rem;
	}
	.menu > span {
		display: flex;
		justify-content: space-between;
		padding: 0.4rem 0.55rem;
		border-radius: 0.4rem;
	}
	.menu > span:nth-child(3) {
		background: var(--muted);
	}

	.alert {
		margin-right: -1.5rem;
	}

	@keyframes type {
		0%,
		6% {
			width: 0;
		}
		32%,
		94% {
			width: calc(var(--n) * 1ch);
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
	@keyframes pop {
		0%,
		30% {
			opacity: 0;
			translate: 0 0.35rem;
		}
		34%,
		56% {
			opacity: 1;
			translate: 0 0;
		}
		60%,
		100% {
			opacity: 0;
			translate: 0 0.35rem;
		}
	}
	@keyframes press {
		0%,
		64% {
			scale: 1;
		}
		66% {
			scale: 0.94;
		}
		69%,
		100% {
			scale: 1;
		}
	}
	@keyframes toast {
		0%,
		66% {
			opacity: 0;
			translate: 0 0.5rem;
		}
		70%,
		94% {
			opacity: 1;
			translate: 0 0;
		}
		98%,
		100% {
			opacity: 0;
		}
	}

	@media (max-width: 72rem) {
		.alert {
			margin-right: 0;
		}
	}
	@media (max-width: 40rem) {
		.stage {
			--rail-overlap: 0rem;
			grid-template-columns: minmax(0, 1fr);
		}
		.rail {
			margin: -0.5rem 0.75rem 0;
			padding: 0;
		}
		.menu,
		.mute,
		.bar kbd,
		.hint span:last-child {
			display: none;
		}
		.alert {
			margin: 0;
		}
		.suggest {
			left: 3rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.typed,
		.suggest,
		.primary,
		.toast {
			animation: none;
		}
		.typed {
			border-right-color: transparent;
		}
		.toast {
			opacity: 0;
		}
	}
</style>
