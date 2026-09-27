<script lang="ts">
	/**
	 * The hero: a morning of notifications, set as type. A quiet pass moves down the list: the
	 * noise fades to gray, and what needs you stays sharp, with its mark. Then it all comes back,
	 * and the pass runs again. CSS only.
	 */
	type Line = { who: string; what: string; where: string; need?: 'review' | 'fail' | 'reply' };
	const LINES: Line[] = [
		{ who: 'dependabot', what: 'bumped vite from 7.1 to 7.2', where: 'web' },
		{ who: 'alice', what: 'asked for your review', where: 'posthog#4821', need: 'review' },
		{ who: 'github-actions', what: 'CI passed on main', where: 'api' },
		{ who: 'renovate', what: 'updated the lock file', where: 'infra' },
		{ who: 'ci', what: 'failed on your pull request', where: 'posthog#4830', need: 'fail' },
		{ who: 'bob', what: 'released v2.14.0', where: 'sdk' },
		{ who: 'carol', what: 'closed an issue you watch', where: 'docs#77' },
		{ who: 'dave', what: 'replied to you', where: 'posthog#4799', need: 'reply' },
		{ who: 'codecov', what: 'commented on coverage', where: 'web#310' }
	];
	const MARK = { review: 'Review', fail: 'Fix CI', reply: 'Reply' };
	const SIGNAL = {
		review: 'var(--signal-review)',
		fail: 'var(--signal-fail)',
		reply: 'var(--signal-reply)'
	};
</script>

<figure class="list" aria-label="A list of notifications where only three stay in focus">
	<ol>
		{#each LINES as l, i (l.where + l.who)}
			<li
				class:need={l.need}
				style:--i={i}
				style:--signal={l.need ? SIGNAL[l.need] : 'transparent'}
			>
				<span class="mark">{l.need ? MARK[l.need] : ''}</span>
				<span class="text"><b>{l.who}</b> {l.what}</span>
				<span class="where">{l.where}</span>
			</li>
		{/each}
	</ol>
	<figcaption><span class="count">3 of 9</span> need you. Hush lets the rest wait.</figcaption>
</figure>

<style>
	.list {
		--loop: 11s;
		--ease: cubic-bezier(0.4, 0, 0.2, 1);
		display: grid;
		gap: 1.5rem;
	}
	ol {
		display: grid;
		border-top: 1px solid var(--border);
	}
	li {
		display: grid;
		grid-template-columns: 4.5rem minmax(0, 1fr) auto;
		align-items: baseline;
		gap: 1rem;
		padding: 0.8rem 0;
		border-bottom: 1px solid var(--border);
		font-size: clamp(1rem, 1.6vw, 1.1875rem);
		letter-spacing: -0.01em;
		animation: quiet var(--loop) var(--ease) infinite;
		/* The pass moves down the list, one line after the other. */
		animation-delay: calc(var(--i) * 0.12s);
	}
	li.need {
		animation-name: stay;
	}
	.text {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.text b {
		font-weight: 500;
	}
	.where {
		font-size: 0.8125em;
		color: var(--muted-foreground);
		font-variant-numeric: tabular-nums;
	}
	.mark {
		justify-self: start;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--signal);
		opacity: 0;
		translate: -0.5rem 0;
		animation: mark var(--loop) var(--ease) infinite;
		animation-delay: calc(var(--i) * 0.12s);
	}
	figcaption {
		font-size: 0.9375rem;
		color: var(--muted-foreground);
		animation: caption var(--loop) var(--ease) infinite;
	}
	.count {
		color: var(--foreground);
		font-weight: 500;
	}

	/* Noise: loud, then gray and a little soft while it is quiet, then loud again. */
	@keyframes quiet {
		0%,
		14% {
			opacity: 1;
			filter: blur(0);
		}
		24%,
		82% {
			opacity: 0.16;
			filter: blur(0.6px);
		}
		92%,
		100% {
			opacity: 1;
			filter: blur(0);
		}
	}
	/* What needs you: stays, and gets its mark. */
	@keyframes stay {
		0%,
		100% {
			opacity: 1;
		}
	}
	@keyframes mark {
		0%,
		16% {
			opacity: 0;
			translate: -0.5rem 0;
		}
		26%,
		82% {
			opacity: 1;
			translate: 0 0;
		}
		90%,
		100% {
			opacity: 0;
			translate: -0.5rem 0;
		}
	}
	@keyframes caption {
		0%,
		20% {
			opacity: 0;
		}
		30%,
		82% {
			opacity: 1;
		}
		90%,
		100% {
			opacity: 0;
		}
	}
	@media (max-width: 40rem) {
		li {
			grid-template-columns: 3.75rem minmax(0, 1fr);
		}
		.where {
			display: none;
		}
	}
	/* Still: the quiet state. */
	@media (prefers-reduced-motion: reduce) {
		li,
		.mark,
		figcaption {
			animation: none;
		}
		li:not(.need) {
			opacity: 0.16;
		}
		.mark {
			opacity: 1;
			translate: 0 0;
		}
	}
</style>
