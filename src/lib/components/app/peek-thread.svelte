<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { sanitize } from '$lib/html';
	import { ago } from '$lib/time';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import CircleDashed from '@lucide/svelte/icons/circle-dashed';
	import CircleMinus from '@lucide/svelte/icons/circle-minus';
	import RotateCw from '@lucide/svelte/icons/rotate-cw';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import ShieldAlert from '@lucide/svelte/icons/shield-alert';
	import ReactionBar from './reaction-bar.svelte';

	/**
	 * The peek of a thread that is not a PR or issue: a workflow run (jobs, failed steps, the end
	 * of their logs, Re-run failed jobs), a release, a commit, a discussion, or Dependabot alerts.
	 */
	let { id, repo, title }: { id: string; repo: string; title: string } = $props();

	const q = createQuery(() => ({
		queryKey: ['peek-thread', id],
		queryFn: () => api.peekThread(id),
		staleTime: 60_000,
		gcTime: 10 * 60_000,
		refetchOnWindowFocus: false
	}));

	/** A job or run result: its icon, color, and word. */
	const RESULT = (status: string, conclusion: string | null) =>
		status !== 'completed'
			? { icon: CircleDashed, tone: 'text-signal-warn', label: status.replace('_', ' ') }
			: conclusion === 'success'
				? { icon: CircleCheck, tone: 'text-signal-merge', label: 'passed' }
				: conclusion === 'failure' || conclusion === 'timed_out'
					? { icon: CircleX, tone: 'text-signal-fail', label: conclusion.replace('_', ' ') }
					: { icon: CircleMinus, tone: 'text-muted-foreground', label: conclusion ?? 'done' };
	const took = (from: string | null, to: string | null) => {
		if (!from || !to) return '';
		const s = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));
		return s < 60
			? `${s}s`
			: s < 3600
				? `${Math.floor(s / 60)}m ${s % 60}s`
				: `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
	};
	const SEVERITY: Record<string, string> = {
		critical: 'bg-signal-fail/15 text-signal-fail',
		high: 'bg-signal-fail/10 text-signal-fail',
		medium: 'bg-signal-warn/12 text-signal-warn',
		low: 'bg-muted text-muted-foreground'
	};

	/** A log box starts at its end, where the error is. */
	const atEnd = (el: HTMLElement) => {
		el.scrollTop = el.scrollHeight;
	};

	let rerunning = $state(false);
	async function rerun(runRepo: string, run: number) {
		rerunning = true;
		try {
			await api.rerunRun(runRepo, run);
			toast.success('Failed jobs are running again');
			setTimeout(() => q.refetch(), 4000);
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			rerunning = false;
		}
	}
</script>

{#snippet link(href: string, text: string)}
	<a
		class="font-mono text-muted-foreground hover:text-foreground hover:underline"
		{href}
		target="_blank"
		rel="noreferrer">{text}</a
	>
{/snippet}

{#if q.isPending}
	<div class="grid gap-3 p-4">
		<Skeleton class="h-5 w-24" />
		<Skeleton class="h-6 w-4/5" />
		<Skeleton class="h-4 w-1/2" />
		<Skeleton class="mt-4 h-24 w-full" />
	</div>
{:else if q.isError}
	<div class="p-4 text-sm">
		<p class="font-medium">Hush cannot show this item.</p>
		<p class="mt-1 text-muted-foreground">{q.error.message}</p>
	</div>
{:else if q.data}
	{@const p = q.data}
	<article class="grid gap-5 p-4 pb-6 text-sm">
		{#if p.kind === 'run'}
			{@const r = p.run}
			{@const res = RESULT(r.status, r.conclusion)}
			<header class="grid gap-2">
				<div class="flex flex-wrap items-center gap-2 text-xs">
					<span class={cn('flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5', res.tone)}
						><res.icon class="size-3.5" />{res.label}</span
					>
					{@render link(p.url, `${p.repo} · ${r.name} #${r.number}`)}
				</div>
				<h2 class="text-base leading-snug font-semibold text-balance">
					<a class="hover:underline" href={p.url} target="_blank" rel="noreferrer">{r.title}</a>
				</h2>
				<p class="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
					<span class="font-mono">{r.branch}</span>
					<span class="font-mono">{r.sha.slice(0, 7)}</span>
					<span>{r.event.replace('_', ' ')}</span>
					{#if r.actor}<span>by {r.actor}</span>{/if}
					<span>started {ago(r.startedAt)}</span>
					{#if r.status === 'completed'}<span>took {took(r.startedAt, r.updatedAt)}</span>{/if}
					{#if r.attempt > 1}<span>attempt {r.attempt}</span>{/if}
				</p>
				{#if r.prs.length}
					<p class="text-xs text-muted-foreground">
						For
						{#each r.prs as n, k (n)}{k ? ', ' : ''}{@render link(
								`https://github.com/${p.repo}/pull/${n}`,
								`#${n}`
							)}{/each}
					</p>
				{/if}
			</header>

			<section class="grid gap-3">
				<h3 class="text-xs font-medium text-muted-foreground">Jobs</h3>
				{#each p.jobs as j (j.id)}
					{@const jr = RESULT(j.status, j.conclusion)}
					<div class={cn('grid gap-2', j.log && 'rounded-xl border p-3')}>
						<a
							href={j.url}
							target="_blank"
							rel="noreferrer"
							class="-mx-1 flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted"
						>
							<jr.icon class={cn('size-4 shrink-0', jr.tone)} />
							<span class="truncate">{j.name}</span>
							<span class="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums"
								>{took(j.startedAt, j.completedAt)}</span
							>
						</a>
						{#if j.failedSteps.length}
							<p class="text-xs text-signal-fail">Failed: {j.failedSteps.join(', ')}</p>
						{/if}
						{#if j.log?.length}
							<pre
								use:atEnd
								class="max-h-72 overflow-auto rounded-md bg-muted p-2 font-mono text-[0.7rem] leading-relaxed">{#each j.log as line, k (k)}<span
										class={cn('block', line.startsWith('##[error]') && 'text-signal-fail')}
										>{line.replace(/^##\[error\]/, '') || ' '}</span
									>{/each}</pre>
						{/if}
					</div>
				{:else}
					<p class="text-muted-foreground">No jobs.</p>
				{/each}
			</section>
			<div class="flex flex-wrap gap-2">
				{#if r.status === 'completed' && r.conclusion === 'failure'}
					<Button size="sm" onclick={() => rerun(p.repo, r.id)} disabled={rerunning}
						><RotateCw />Re-run failed jobs</Button
					>
				{/if}
				<Button variant="outline" size="sm" href={p.url} target="_blank" rel="noreferrer"
					><ExternalLink />Open the run on GitHub</Button
				>
			</div>
		{:else if p.kind === 'release'}
			<header class="grid gap-2">
				<div class="flex flex-wrap items-center gap-2 text-xs">
					<span class="rounded-md bg-muted px-1.5 py-0.5"
						>{p.prerelease ? 'Pre-release' : 'Release'}</span
					>
					{@render link(p.url, `${p.repo} · ${p.tag}`)}
				</div>
				<h2 class="text-base leading-snug font-semibold text-balance">{p.name}</h2>
				<p class="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
					{#if p.author}<span>by {p.author}</span>{/if}
					{#if p.publishedAt}<span>published {ago(p.publishedAt)}</span>{/if}
					{#if p.assets}<span>{p.assets} {p.assets === 1 ? 'asset' : 'assets'}</span>{/if}
				</p>
			</header>
			{#if p.html.trim()}
				<div class="gh-html">{@html sanitize(p.html)}</div>
			{:else}
				<p class="text-muted-foreground italic">No release notes.</p>
			{/if}
		{:else if p.kind === 'commit'}
			<header class="grid gap-2">
				<div class="flex flex-wrap items-center gap-2 text-xs">
					<span class="rounded-md bg-muted px-1.5 py-0.5">Commit</span>
					{@render link(p.url, `${p.repo}@${p.sha.slice(0, 7)}`)}
				</div>
				<h2 class="text-base leading-snug font-semibold text-balance">
					{p.message.split('\n')[0]}
				</h2>
				<p class="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
					{#if p.author}<span>by {p.author}</span>{/if}
					{#if p.date}<span>{ago(p.date)}</span>{/if}
					<span class="text-signal-merge tabular-nums">+{p.additions}</span>
					<span class="text-signal-fail tabular-nums">−{p.deletions}</span>
				</p>
			</header>
			{#if p.message.includes('\n')}
				<pre class="font-sans text-sm whitespace-pre-wrap">{p.message
						.split('\n')
						.slice(1)
						.join('\n')
						.trim()}</pre>
			{/if}
			<section class="grid gap-1 text-[0.8rem]">
				<h3 class="text-xs font-medium text-muted-foreground">
					{p.totalFiles}
					{p.totalFiles === 1 ? 'file' : 'files'}
				</h3>
				{#each p.files as f (f.name)}
					<div class="flex items-center gap-2">
						<span class="min-w-0 truncate font-mono text-xs">{f.name}</span>
						<span class="ml-auto shrink-0 text-xs tabular-nums"
							><span class="text-signal-merge">+{f.additions}</span>
							<span class="text-signal-fail">−{f.deletions}</span></span
						>
					</div>
				{/each}
			</section>
		{:else if p.kind === 'discussion'}
			<header class="grid gap-2">
				<div class="flex flex-wrap items-center gap-2 text-xs">
					<span
						class={cn(
							'rounded-md px-1.5 py-0.5',
							p.answered ? 'bg-signal-merge/12 text-signal-merge' : 'bg-muted'
						)}>{p.answered ? 'Answered' : (p.category ?? 'Discussion')}</span
					>
					{@render link(p.url, `${p.repo}#${p.number}`)}
				</div>
				<h2 class="text-base leading-snug font-semibold text-balance">
					<a class="hover:underline" href={p.url} target="_blank" rel="noreferrer">{p.title}</a>
				</h2>
				<p class="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
					{#if p.author}<span>by {p.author}</span>{/if}
					<span>{ago(p.createdAt)}</span>
					<span>{p.totalComments} {p.totalComments === 1 ? 'comment' : 'comments'}</span>
				</p>
			</header>
			<div class="gh-html">{@html sanitize(p.html)}</div>
			{#if p.reactions}<ReactionBar r={p.reactions} />{/if}
			{#if p.comments.length}
				<section class="grid gap-4 border-t pt-4">
					{#if p.totalComments > p.comments.length}
						<p class="text-xs text-muted-foreground">
							The last {p.comments.length} of {p.totalComments} comments.
						</p>
					{/if}
					{#each p.comments as c (c.url)}
						<div class="grid gap-1">
							<p class="text-xs text-muted-foreground">
								<span class="font-medium text-foreground">{c.author ?? 'ghost'}</span>
								{ago(c.createdAt)}
							</p>
							<div class="gh-html">{@html sanitize(c.html)}</div>
							{#if c.reactions}<ReactionBar r={c.reactions} class="mt-1" />{/if}
						</div>
					{/each}
				</section>
			{/if}
		{:else if p.kind === 'alerts'}
			<header class="grid gap-2">
				<div class="flex flex-wrap items-center gap-2 text-xs">
					<span
						class="flex items-center gap-1 rounded-md bg-signal-fail/10 px-1.5 py-0.5 text-signal-fail"
						><ShieldAlert class="size-3.5" />Dependabot</span
					>
					{@render link(p.url, p.repo)}
				</div>
				<h2 class="text-base leading-snug font-semibold text-balance">{title}</h2>
			</header>
			{#if p.error}
				<p class="text-muted-foreground">{p.error}</p>
			{:else}
				<section class="grid gap-3">
					<h3 class="text-xs font-medium text-muted-foreground">
						{p.alerts.length ? 'Open alerts, newest first' : 'No open alerts.'}
					</h3>
					{#each p.alerts as a (a.number)}
						<a
							href={a.url}
							target="_blank"
							rel="noreferrer"
							class="-mx-2 grid gap-1 rounded-lg px-2 py-1.5 hover:bg-muted"
						>
							<span class="flex items-center gap-2">
								<span
									class={cn(
										'rounded-md px-1.5 py-0.5 text-[0.7rem] capitalize',
										SEVERITY[a.severity] ?? SEVERITY.low
									)}>{a.severity}</span
								>
								<span class="truncate font-medium">{a.summary}</span>
							</span>
							<span class="text-xs text-muted-foreground"
								>{a.package} ({a.ecosystem}){#if a.patched}, fixed in {a.patched}{/if}{#if a.manifest}
									· {a.manifest}{/if} · {ago(a.createdAt)}</span
							>
						</a>
					{/each}
				</section>
			{/if}
		{:else}
			<header class="grid gap-2">
				{@render link(p.url, repo)}
				<h2 class="text-base leading-snug font-semibold text-balance">{title}</h2>
			</header>
			<p class="text-muted-foreground">{p.note}</p>
			<div>
				<Button variant="outline" size="sm" href={p.url} target="_blank" rel="noreferrer"
					><ExternalLink />Open on GitHub</Button
				>
			</div>
		{/if}
	</article>
{/if}
