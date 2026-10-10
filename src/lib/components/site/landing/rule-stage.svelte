<script lang="ts">
	import MockAvatar from './mock-avatar.svelte';
	import { DEMO_GH } from './demo-data';

	const SETTINGS_JSON = `{
  "pushDigestMinutes": 30,
  "categoryGroups": [{
    "id": "area", "name": "Area",
    "categories": [
      { "id": "deps", "name": "Dependencies", "color": "teal",
        "rule": "repo:PostHog/* author:dependabot*",
        "description": "Dependency updates" },
      { "id": "docs", "name": "Docs", "color": "blue",
        "description": "Changes to the docs or the website" }
    ]
  }],
  "views": [
    { "id": "website", "name": "Website",
      "searches": ["repo:PostHog/posthog.com is:open"], "items": [] }
  ],
  "dash": { "staleDays": 5 },
  "keys": { "inbox.done": ["d"] },
  "swipe": { "inbox": { "right": "done" } }
}`;

	type TokenKind = 'key' | 'str' | 'lit' | 'punct' | 'plain';
	const TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|(\b\d+\b|true|false|null)|([{}[\],])/g;

	function tokenize(line: string): { kind: TokenKind; text: string }[] {
		const out: { kind: TokenKind; text: string }[] = [];
		let last = 0;
		for (const match of line.matchAll(TOKEN)) {
			const start = match.index ?? 0;
			if (start > last) out.push({ kind: 'plain', text: line.slice(last, start) });
			if (match[1]) {
				out.push({ kind: match[2] ? 'key' : 'str', text: match[1] });
				if (match[2]) out.push({ kind: 'punct', text: match[2] });
			} else if (match[3]) out.push({ kind: 'lit', text: match[3] });
			else out.push({ kind: 'punct', text: match[0] });
			last = start + match[0].length;
		}
		if (last < line.length) out.push({ kind: 'plain', text: line.slice(last) });
		return out;
	}

	const LINES = SETTINGS_JSON.split('\n').map(tokenize);
	const RULE_LINE = 6;

	const QUERY = [
		{ key: 'repo:', value: 'PostHog/* ' },
		{ key: 'author:', value: 'dependabot*' }
	];
	const QUERY_LENGTH = QUERY.reduce((n, part) => n + part.key.length + part.value.length, 0);

	const THREADS = [
		{
			title: 'chore(deps): bump urllib3 from 2.5.0 to 2.8.0 in /scripts/hogfm',
			person: DEMO_GH.dependabot,
			caught: true
		},
		{
			title: 'Add Juno customer case study and cross-links',
			person: DEMO_GH.joethreepwood,
			caught: false
		},
		{
			title: 'chore(deps): bump anyio from 4.11.0 to 4.14.2 in /scripts/hogfm',
			person: DEMO_GH.dependabot,
			caught: true
		},
		{
			title: 'chore(deps): bump pyasn1 from 0.6.1 to 0.6.4 in /scripts/hogfm',
			person: DEMO_GH.dependabot,
			caught: true
		}
	];
</script>

<div class="stage" aria-hidden="true">
	<div class="editor">
		<div class="tab-bar">
			<span class="file">settings.json</span>
			<span class="saved">Saved · applies on every device</span>
		</div>
		<div class="code">
			{#each LINES as tokens, n (n)}
				<div class="ln" class:hot={n === RULE_LINE}>
					<span class="no">{n + 1}</span>
					<span class="src"
						>{#each tokens as token, t (t)}<span class={token.kind}>{token.text}</span>{/each}</span
					>
				</div>
			{/each}
		</div>
	</div>

	<div class="rule">
		<div class="rule-head">
			<b>Dependencies</b>
			<span class="switch"></span>
		</div>
		<div class="field">
			<span class="lbl">When</span>
			<span class="query"
				><span class="typed" style:--n={QUERY_LENGTH}
					>{#each QUERY as part (part.key)}<span class="k">{part.key}</span
						>{part.value}{/each}</span
				></span
			>
		</div>
		<div class="field">
			<span class="lbl">Group</span>
			<span class="choices">
				<span>Effort</span>
				<span class="pick">Area</span>
			</span>
		</div>
		<ul class="threads">
			{#each THREADS as thread, i (thread.title)}
				<li class:caught={thread.caught} style:--i={i}>
					<MockAvatar person={thread.person} size={1.25} />
					<span class="t">{thread.title}</span>
					{#if thread.caught}<span class="to">→ Dependencies</span>{/if}
				</li>
			{/each}
		</ul>
		<div class="rule-foot">
			<span>Dependencies: <b>3 items</b></span>
			<span class="save">Save categories</span>
		</div>
	</div>
</div>

<style>
	.stage {
		--loop: 10s;
		--ease: cubic-bezier(0.16, 1, 0.3, 1);
		--mono: ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace;
		position: relative;
		padding: 0 0 4rem;
		font-size: 0.8125rem;
		line-height: 1.35;
		text-align: left;
	}

	.editor {
		width: min(100%, 32rem);
		overflow: hidden;
		border-radius: 1rem;
		border: 1px solid color-mix(in oklab, var(--foreground) 10%, transparent);
		background: var(--background);
		box-shadow: 0 30px 80px -40px rgb(0 0 0 / 0.35);
	}
	.tab-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.55rem 0.875rem;
		border-bottom: 1px solid var(--border);
		font-size: 0.75rem;
		color: var(--muted-foreground);
	}
	.file {
		font-family: var(--mono);
		color: var(--foreground);
	}
	.code {
		padding: 0.625rem 0;
		font-family: var(--mono);
		font-size: 0.71875rem;
		line-height: 1.6;
		white-space: pre;
		overflow: hidden;
	}
	.ln {
		display: flex;
		padding-right: 1rem;
	}
	.ln.hot {
		background: color-mix(in oklab, var(--signal-review) 10%, transparent);
	}
	.no {
		flex: none;
		width: 2.5rem;
		padding-right: 0.875rem;
		text-align: right;
		color: color-mix(in oklab, var(--muted-foreground) 60%, transparent);
		font-variant-numeric: tabular-nums;
	}
	.key {
		color: var(--signal-review);
	}
	.str {
		color: var(--signal-merge);
	}
	.lit {
		color: var(--signal-warn);
	}
	.punct {
		color: var(--muted-foreground);
	}

	.rule {
		position: absolute;
		right: 0;
		bottom: 0;
		display: grid;
		gap: 0.75rem;
		width: min(100%, 23rem);
		padding: 1rem;
		border-radius: 1rem;
		border: 1px solid color-mix(in oklab, var(--foreground) 12%, transparent);
		background: var(--popover);
		box-shadow:
			0 1px 2px rgb(0 0 0 / 0.06),
			0 30px 60px -24px rgb(0 0 0 / 0.4);
	}
	.rule-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.rule-head b {
		font-weight: 600;
	}
	.switch {
		position: relative;
		width: 1.75rem;
		height: 1rem;
		border-radius: 999px;
		background: var(--foreground);
	}
	.switch::after {
		content: '';
		position: absolute;
		top: 0.125rem;
		right: 0.125rem;
		width: 0.75rem;
		height: 0.75rem;
		border-radius: 999px;
		background: var(--background);
	}
	.field {
		display: grid;
		grid-template-columns: 2.75rem minmax(0, 1fr);
		align-items: center;
		gap: 0.5rem;
	}
	.lbl {
		font-size: 0.75rem;
		color: var(--muted-foreground);
	}
	.query {
		padding: 0.45rem 0.6rem;
		border-radius: 0.5rem;
		border: 1px solid var(--signal-review);
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--signal-review) 18%, transparent);
		font-family: var(--mono);
		font-size: 0.71875rem;
		white-space: nowrap;
		overflow: hidden;
	}
	.typed {
		display: inline-block;
		vertical-align: bottom;
		width: calc(var(--n) * 1ch + 2px);
		overflow: hidden;
		border-right: 2px solid var(--signal-review);
		animation:
			type var(--loop) steps(var(--n)) infinite,
			caret 0.9s steps(1) infinite;
	}
	.k {
		color: var(--signal-review);
	}
	.choices {
		display: flex;
		gap: 0.35rem;
		font-size: 0.75rem;
	}
	.choices span {
		padding: 0.25rem 0.55rem;
		border-radius: 999px;
		border: 1px solid var(--border);
		color: var(--muted-foreground);
	}
	.choices .pick {
		animation: pick var(--loop) var(--ease) infinite;
	}
	.threads {
		display: grid;
		padding-top: 0.25rem;
		border-top: 1px solid var(--border);
	}
	.threads li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0;
		font-size: 0.75rem;
	}
	.threads .t {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.threads .caught {
		animation: catch var(--loop) var(--ease) infinite;
		animation-delay: calc(var(--i) * 0.12s);
	}
	.to {
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--muted-foreground);
	}
	.rule-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		font-size: 0.75rem;
		color: var(--muted-foreground);
	}
	.rule-foot b {
		font-weight: 600;
		color: var(--foreground);
	}
	.save {
		padding: 0.35rem 0.7rem;
		border-radius: 0.5rem;
		background: var(--foreground);
		color: var(--background);
		font-weight: 500;
	}

	@keyframes type {
		0% {
			width: 0;
		}
		32%,
		94% {
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
	@keyframes pick {
		0%,
		38% {
			border-color: var(--border);
			background: transparent;
			color: var(--muted-foreground);
		}
		42%,
		94% {
			border-color: var(--foreground);
			background: var(--foreground);
			color: var(--background);
		}
		100% {
			border-color: var(--border);
			background: transparent;
			color: var(--muted-foreground);
		}
	}
	@keyframes catch {
		0%,
		46% {
			opacity: 1;
			translate: 0 0;
		}
		54%,
		92% {
			opacity: 0.35;
			translate: 0.75rem 0;
		}
		100% {
			opacity: 1;
			translate: 0 0;
		}
	}

	@media (max-width: 40rem) {
		.stage {
			padding: 0;
		}
		.editor {
			width: 100%;
		}
		.code {
			font-size: 0.65rem;
		}
		.rule {
			position: relative;
			width: auto;
			margin: -5rem 0.75rem 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.typed,
		.choices .pick,
		.threads .caught {
			animation: none;
		}
		.typed {
			border-right-color: transparent;
		}
		.choices .pick {
			border-color: var(--foreground);
			background: var(--foreground);
			color: var(--background);
		}
		.threads .caught {
			opacity: 0.35;
		}
	}
</style>
