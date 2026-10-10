<script lang="ts">
	import { untrack } from 'svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { followWhileGrowing, revealEntry } from '$lib/reveal';
	import { meQuery, peekQuery } from '$lib/queries';
	import { keys, refetchUnlessLive } from '$lib/queries';
	import { externalContributor } from '$lib/shared/contributors';
	import { rowShows } from '$lib/shared/row-parts';
	import { sanitize } from '$lib/html';
	import { ago } from '$lib/time';
	import { cn } from '$lib/utils';
	import type { CheckState, PeekDTO, PeekEntry } from '$lib/shared/types';
	import CommentBox from './comment-box.svelte';
	import PeekSlack from './peek-slack.svelte';
	import PeekProjects from './peek-projects.svelte';
	import PeekFiles from './peek-files.svelte';
	import ReactionBar from './reaction-bar.svelte';
	import ExternalBadge from './external-badge.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
	import GitPullRequestDraft from '@lucide/svelte/icons/git-pull-request-draft';
	import GitMerge from '@lucide/svelte/icons/git-merge';
	import GitPullRequestClosed from '@lucide/svelte/icons/git-pull-request-closed';
	import CircleDot from '@lucide/svelte/icons/circle-dot';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import CircleDashed from '@lucide/svelte/icons/circle-dashed';
	import CircleMinus from '@lucide/svelte/icons/circle-minus';
	import Users from '@lucide/svelte/icons/users';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	/** The contents of the peek panel: one PR or issue, fetched when shown. */
	let {
		repo,
		number,
		showFiles = true
	}: { repo: string; number: number; showFiles?: boolean } = $props();

	const q = createQuery(() => peekQuery(repo, number));
	const me = createQuery(meQuery);
	const external = $derived(
		q.data && rowShows(me.data?.settings.rows, q.data.kind, 'external')
			? externalContributor(q.data.authorAssociation, q.data.author.bot)
			: null
	);
	// The server stored what this peek read. If that changed the dashboards, refetch them now
	// (once per fetch), so every view agrees with the peek.
	let synced = 0;
	$effect(() => {
		const at = q.dataUpdatedAt;
		const sync = q.data?.sync;
		if (!sync?.changed || at === synced) return;
		synced = at;
		refetchUnlessLive(keys.dashAll, keys.alerts);
	});
	let composerEnd = $state<HTMLElement | null>(null);
	let shownEntryCount: number | null = null;
	$effect.pre(() => {
		const count = q.data?.timeline.items.length;
		if (count === undefined) return;
		const entryAdded = shownEntryCount !== null && count > shownEntryCount;
		shownEntryCount = count;
		if (entryAdded && composerEnd) untrack(() => followWhileGrowing(composerEnd!));
	});
	let allChecks = $state(false);
	// A new item starts with the passed checks folded.
	$effect(() => {
		void repo;
		void number;
		allChecks = false;
	});

	const STATE = {
		open: { label: 'Open', tone: 'bg-signal-merge/12 text-signal-merge' },
		draft: { label: 'Draft', tone: 'bg-muted text-muted-foreground' },
		merged: { label: 'Merged', tone: 'bg-signal-reply/12 text-signal-reply' },
		closed: { label: 'Closed', tone: 'bg-signal-fail/12 text-signal-fail' }
	};
	const stateOf = (p: PeekDTO) => (p.state === 'open' && p.draft ? 'draft' : p.state);
	const stateIcon = (p: PeekDTO) => {
		const s = stateOf(p);
		if (p.kind === 'issue') return s === 'closed' ? CircleCheck : CircleDot;
		return s === 'merged'
			? GitMerge
			: s === 'closed'
				? GitPullRequestClosed
				: s === 'draft'
					? GitPullRequestDraft
					: GitPullRequest;
	};

	const CHECK: Record<CheckState, { icon: typeof CircleCheck; tone: string; label: string }> = {
		failure: { icon: CircleX, tone: 'text-signal-fail', label: 'failed' },
		pending: { icon: CircleDashed, tone: 'text-signal-warn', label: 'running' },
		neutral: { icon: CircleMinus, tone: 'text-muted-foreground', label: 'skipped' },
		success: { icon: CircleCheck, tone: 'text-signal-merge', label: 'passed' }
	};
	const REVIEW: Record<string, { label: string; tone: string }> = {
		APPROVED: { label: 'approved', tone: 'text-signal-merge' },
		CHANGES_REQUESTED: { label: 'requested changes', tone: 'text-signal-fail' },
		COMMENTED: { label: 'reviewed', tone: 'text-muted-foreground' },
		DISMISSED: { label: 'review dismissed', tone: 'text-muted-foreground' },
		PENDING: { label: 'review pending', tone: 'text-muted-foreground' }
	};
	const counts = (checks: { state: CheckState }[]) =>
		(['failure', 'pending', 'success', 'neutral'] as const)
			.map((s) => ({ s, n: checks.filter((c) => c.state === s).length }))
			.filter((x) => x.n);
	const entryVerb = (e: PeekEntry) =>
		e.type === 'comment' ? 'commented' : (REVIEW[e.state ?? ''] ?? REVIEW.COMMENTED).label;
</script>

{#snippet avatar(src: string | null, size = 'size-5')}
	{#if src}
		<img {src} alt="" class={cn(size, 'shrink-0 rounded-full bg-muted')} loading="lazy" />
	{:else}
		<span class={cn(size, 'shrink-0 rounded-full bg-muted')}></span>
	{/if}
{/snippet}

{#if q.isPending}
	<div class="grid gap-3 p-4">
		<Skeleton class="h-5 w-24" />
		<Skeleton class="h-6 w-4/5" />
		<Skeleton class="h-4 w-1/2" />
		<Skeleton class="mt-4 h-24 w-full" />
		<Skeleton class="h-16 w-full" />
	</div>
{:else if q.isError}
	<div class="p-4 text-sm">
		<p class="font-medium">Hush cannot show this item.</p>
		<p class="mt-1 text-muted-foreground">{q.error.message}</p>
	</div>
{:else if q.data}
	{@const p = q.data}
	{@const st = STATE[stateOf(p)]}
	{@const Icon = stateIcon(p)}
	<article class="grid gap-5 p-4 pb-6">
		<header class="grid gap-2">
			<div class="flex flex-wrap items-center gap-2 text-xs">
				<span class={cn('flex items-center gap-1 rounded-full px-2 py-0.5 font-medium', st.tone)}
					><Icon class="size-3.5" />{st.label}</span
				>
				<a
					class="font-mono text-muted-foreground hover:text-foreground hover:underline"
					href={p.url}
					target="_blank"
					rel="noreferrer">{p.repo}#{p.number}</a
				>
				<PeekProjects repo={p.repo} number={p.number} />
			</div>
			<h2 class="text-base leading-snug font-semibold text-balance">
				<a class="hover:underline" href={p.url} target="_blank" rel="noreferrer">{p.title}</a>
			</h2>
			<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
				<span class="flex items-center gap-1.5"
					>{@render avatar(p.author.avatar, 'size-4')}<span class="text-foreground"
						>{p.author.login}</span
					></span
				>
				{#if external}<ExternalBadge contributor={external} class="py-0 text-[0.7rem]" />{/if}
				<span>opened {ago(p.createdAt)}</span>
				{#if p.pr}
					<span class="opacity-50">·</span>
					<span class="text-signal-merge tabular-nums">+{p.pr.additions}</span>
					<span class="text-signal-fail tabular-nums">−{p.pr.deletions}</span>
					<span>{p.pr.files} {p.pr.files === 1 ? 'file' : 'files'}</span>
				{/if}
			</div>
			{#if p.pr}
				<p
					class="truncate font-mono text-[0.7rem] text-muted-foreground"
					title="{p.pr.base} ← {p.pr.head}"
				>
					{p.pr.base} ← {p.pr.head}
				</p>
			{/if}
			{#if p.labels.length}
				<div class="flex flex-wrap gap-1">
					{#each p.labels as l (l.name)}
						<span
							class="rounded-full border px-2 py-0.5 text-[0.7rem]"
							style="border-color: #{l.color}80; background: #{l.color}1f">{l.name}</span
						>
					{/each}
				</div>
			{/if}
		</header>

		{#if p.pr}
			{@const pr = p.pr}
			<section class="grid gap-3 rounded-xl border p-3 text-[0.8rem]">
				<div class="grid gap-1.5">
					<h3 class="text-xs font-medium text-muted-foreground">Reviews</h3>
					{#if !pr.reviews.length && !pr.requested.length}
						<p class="text-muted-foreground">No reviews yet.</p>
					{/if}
					{#each pr.reviews as r (r.who.login)}
						{@const rv = REVIEW[r.state] ?? REVIEW.COMMENTED}
						<div class="flex items-center gap-2">
							{@render avatar(r.who.avatar)}
							<span class="truncate">{r.who.login}</span>
							<span class={cn('ml-auto shrink-0', rv.tone)}>{rv.label}</span>
						</div>
					{/each}
					{#each pr.requested as r (r.name)}
						<div class="flex items-center gap-2">
							{#if r.team}<Users class="size-5 p-0.5 text-muted-foreground" />{:else}<span
									class="size-5 rounded-full border border-dashed"
								></span>{/if}
							<span class="truncate">{r.name}</span>
							<span class="ml-auto shrink-0 text-muted-foreground">requested</span>
						</div>
					{/each}
				</div>

				{#if pr.openThreads && p.state === 'open'}
					<p class="flex items-center gap-2 border-t pt-3 text-signal-reply">
						<MessageSquare class="size-4" />{pr.openThreads} review {pr.openThreads === 1
							? 'thread is'
							: 'threads are'} not resolved.
					</p>
				{/if}
				{#if pr.mergeable === 'CONFLICTING' && p.state === 'open'}
					<p class="flex items-center gap-2 border-t pt-3 text-signal-warn">
						<TriangleAlert class="size-4" />This branch has merge conflicts.
					</p>
				{/if}
				{#if pr.checksTotal}
					{@const shown = allChecks
						? pr.checks
						: pr.checks.filter((c) => c.state === 'failure' || c.state === 'pending')}
					<div class="grid gap-1.5 border-t pt-3">
						<h3
							class="flex flex-wrap items-center gap-x-2 text-xs font-medium text-muted-foreground"
						>
							Checks
							{#each counts(pr.checks) as { s, n } (s)}
								<span class={cn('font-normal', CHECK[s].tone)}>{n} {CHECK[s].label}</span>
							{/each}
						</h3>
						{#each shown as c, k (k)}
							{@const ci = CHECK[c.state]}
							<a
								href={c.url ?? p.url + '/checks'}
								target="_blank"
								rel="noreferrer"
								class="-mx-1 flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted"
							>
								<ci.icon class={cn('size-4 shrink-0', ci.tone)} />
								<span class="truncate">{c.name}</span>
							</a>
						{/each}
						{#if shown.length < pr.checks.length || pr.checksTotal > pr.checks.length}
							<button
								type="button"
								class="justify-self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
								onclick={() => (allChecks = !allChecks)}
							>
								{allChecks ? 'Show only failed and running' : `Show all ${pr.checksTotal}`}
							</button>
						{/if}
					</div>
				{/if}
				{#if showFiles && pr.files}
					<PeekFiles
						repo={p.repo}
						number={p.number}
						head={p.can.pr?.headOid ?? ''}
						changedFiles={pr.files}
					/>
				{/if}
			</section>
		{/if}

		<section>
			{#if p.html.trim()}
				<div class="gh-html">{@html sanitize(p.html)}</div>
			{:else}
				<p class="text-sm text-muted-foreground italic">No description.</p>
			{/if}
			{#if p.reactions}<ReactionBar r={p.reactions} class="mt-3" />{/if}
		</section>

		{#if p.kind === 'pr' || p.kind === 'issue'}
			<PeekSlack {repo} {number} kind={p.kind} />
		{/if}

		<section class="grid">
			<h3 class="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
				<MessageSquare class="size-3.5" />Activity
				{#if p.timeline.total > p.timeline.items.length}
					<a
						href={p.url}
						target="_blank"
						rel="noreferrer"
						class="ml-auto flex items-center gap-1 font-normal hover:text-foreground"
						>{p.timeline.total - p.timeline.items.length} older on GitHub<ExternalLink
							class="size-3"
						/></a
					>
				{/if}
			</h3>
			{#if !p.timeline.items.length}
				<p
					class="pb-3 text-sm text-muted-foreground"
					out:slide={{ duration: 200, easing: cubicOut }}
				>
					No comments yet.
				</p>
			{/if}
			{#each p.timeline.items as e (e.url)}
				{@const tone = e.type === 'review' ? (REVIEW[e.state ?? '']?.tone ?? '') : ''}
				<div class="grid gap-1.5 pb-3" in:revealEntry>
					<div class="flex items-center gap-2 text-xs">
						{@render avatar(e.author.avatar)}
						<span class="truncate font-medium">{e.author.login}</span>
						<span class={cn('shrink-0 text-muted-foreground', tone)}>{entryVerb(e)}</span>
						{#if e.inline}
							<span class="shrink-0 text-muted-foreground">· {e.inline} on the diff</span>
						{/if}
						<a
							href={e.url}
							target="_blank"
							rel="noreferrer"
							class="ml-auto shrink-0 text-muted-foreground tabular-nums hover:text-foreground"
							>{ago(e.at)}</a
						>
					</div>
					{#if e.html.trim()}
						<div class="gh-html ml-7 rounded-lg bg-muted/50 px-3 py-2">
							{@html sanitize(e.html)}
						</div>
					{/if}
					{#if e.reactions}<ReactionBar r={e.reactions} class="ml-7" />{/if}
				</div>
			{/each}
			<CommentBox {p} />
			<div bind:this={composerEnd}></div>
		</section>
	</article>
{/if}
