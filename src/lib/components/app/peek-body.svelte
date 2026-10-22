<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { followWhileGrowing, keepInPlace, revealEntry } from '$lib/reveal';
	import {
		meQuery,
		peekQuery,
		queryClient,
		refetchUnlessLive,
		reviewThreadsQuery
	} from '$lib/queries';
	import { taskCheckboxes, type SavedTaskText } from '$lib/task-checkboxes';
	import { keys } from '$lib/queries';
	import { api } from '$lib/api';
	import { hiddenOlderCount, PEEK_TIMELINE_PAGE, withOlderPage } from '$lib/shared/peek-timeline';
	import { setAttachTarget } from '$lib/attachments.svelte';
	import { canAttach } from '$lib/shared/attachments';
	import { threadsByReview } from '$lib/shared/diff';
	import { reviewThreadPath } from '$lib/shared/in-app-links';
	import { externalContributor } from '$lib/shared/contributors';
	import { rowShows } from '$lib/shared/row-parts';
	import { subjectKey } from '$lib/shared/subject';
	import { sanitize } from '$lib/html';
	import { STATE, shownStateOf, stateIcon } from '$lib/item-state';
	import { ago } from '$lib/time';
	import { cn } from '$lib/utils';
	import type { CheckState, PeekDTO, PeekEntry } from '$lib/shared/types';
	import CommentBox from './comment-box.svelte';
	import CommentEditor from './comment-editor.svelte';
	import PeekSlack from './peek-slack.svelte';
	import PeekProjects from './peek-projects.svelte';
	import PeekFiles from './peek-files.svelte';
	import ReactionBar from './reaction-bar.svelte';
	import ReviewThread from './review-thread.svelte';
	import ExternalBadge from './external-badge.svelte';
	import GhLink from './gh-link.svelte';
	import { branchUrl, labelUrl, profileUrl, teamUrl } from '$lib/shared/github-links';
	import { FILES_TAB, itemPagePath } from '$lib/shared/item-page';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import CircleDashed from '@lucide/svelte/icons/circle-dashed';
	import CircleMinus from '@lucide/svelte/icons/circle-minus';
	import Users from '@lucide/svelte/icons/users';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import Pencil from '@lucide/svelte/icons/pencil';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Tip from './tip.svelte';

	/** The contents of the peek panel: one PR or issue, fetched when shown. */
	let {
		repo,
		number,
		showFiles = true
	}: { repo: string; number: number; showFiles?: boolean } = $props();

	const q = createQuery(() => peekQuery(repo, number));
	const me = createQuery(meQuery);
	setAttachTarget(() => ({ repo, allowed: canAttach(q.data?.can.permission ?? null) }));
	const hasReviewsOnDiff = $derived(
		q.data?.kind === 'pr' && q.data.timeline.items.some((e) => e.type === 'review' && e.inline)
	);
	const threadsQ = createQuery(() => ({
		...reviewThreadsQuery(repo, number),
		enabled: hasReviewsOnDiff
	}));
	const threadsOfReview = $derived(threadsByReview(threadsQ.data?.threads ?? []));
	function refreshThreads() {
		void queryClient.invalidateQueries({ queryKey: keys.peek(repo, number) });
		return queryClient.refetchQueries({ queryKey: keys.reviewThreads(repo, number) });
	}
	const external = $derived(
		q.data && rowShows(me.data?.settings.rows, q.data.kind, 'external')
			? externalContributor(q.data.authorAssociation, q.data.author.bot)
			: null
	);
	let composerEnd = $state<HTMLElement | null>(null);
	let shownEntryCount: number | null = null;
	let shownNewestId: string | undefined;
	$effect.pre(() => {
		const items = q.data?.timeline.items;
		if (!items) return;
		const newestId = items.at(-1)?.id;
		const entryAdded =
			shownEntryCount !== null && items.length > shownEntryCount && newestId !== shownNewestId;
		shownEntryCount = items.length;
		shownNewestId = newestId;
		if (entryAdded && composerEnd) untrack(() => followWhileGrowing(composerEnd!));
	});
	function updatePeek(change: (old: PeekDTO) => PeekDTO) {
		queryClient.setQueryData<PeekDTO>(keys.peek(repo, number), (old) => old && change(old));
		refetchUnlessLive(keys.items);
	}
	const reloadPeek = () => queryClient.invalidateQueries({ queryKey: keys.peek(repo, number) });
	const descriptionTasks = (id: string, markdown: string) =>
		taskCheckboxes({
			id,
			markdown,
			onsaved: ({ body, html }: SavedTaskText) => updatePeek((old) => ({ ...old, body, html })),
			onconflict: reloadPeek
		});
	const entryTasks = (id: string, markdown: string) =>
		taskCheckboxes({
			id,
			markdown,
			onsaved: (saved: SavedTaskText) =>
				updatePeek((old) => ({
					...old,
					timeline: {
						...old.timeline,
						items: old.timeline.items.map((item) => (item.id === id ? { ...item, ...saved } : item))
					}
				})),
			onconflict: reloadPeek
		});
	const shownSubject = $derived(subjectKey(repo, number));
	const hiddenOlder = $derived(q.data ? hiddenOlderCount(q.data) : 0);
	let olderLoadingFor = $state<string | null>(null);
	let prependingOlder = $state(false);
	let activity = $state<HTMLElement | null>(null);
	let olderError = $state<{ subject: string; message: string } | null>(null);
	async function loadOlder(p: PeekDTO) {
		const before = p.timeline.before;
		const subject = subjectKey(p.repo, p.number);
		if (!before || olderLoadingFor === subject) return;
		olderLoadingFor = subject;
		olderError = null;
		try {
			const page = await api.peekOlder(p.repo, p.number, before);
			prependingOlder = true;
			await keepInPlace(activity?.querySelector('[data-peek-entry]') ?? null, () =>
				queryClient.setQueryData<PeekDTO>(
					keys.peek(p.repo, p.number),
					(old) => old && withOlderPage(old, before, page)
				)
			);
		} catch (err) {
			olderError = { subject, message: (err as Error).message };
		} finally {
			olderLoadingFor = null;
			prependingOlder = false;
		}
	}
	let allChecks = $state(false);
	let editingId = $state<string | null>(null);
	let editTrigger: HTMLButtonElement | null = null;
	function closeEditor() {
		editingId = null;
		void tick().then(() => editTrigger?.focus());
	}

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
	<div class="p-4 text-sm" data-item-ready={subjectKey(repo, number)}>
		<p class="font-medium">Hush cannot show this item.</p>
		<p class="mt-1 text-muted-foreground">{q.error.message}</p>
	</div>
{:else if q.data}
	{@const p = q.data}
	{@const st = STATE[shownStateOf(p)]}
	{@const Icon = stateIcon(p)}
	<article class="grid gap-5 p-4 pb-6" data-item-ready={subjectKey(repo, number)}>
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
				{#if p.kind === 'pr' || p.kind === 'issue'}
					<PeekSlack {repo} {number} kind={p.kind} class="ml-auto" />
				{/if}
			</div>
			<h2 class="text-base leading-snug font-semibold text-balance">
				<a class="hover:underline" href={p.url} target="_blank" rel="noreferrer">{p.title}</a>
			</h2>
			<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
				<GhLink
					href={profileUrl(p.author.login, p.author.bot)}
					class="flex items-center gap-1.5 text-foreground"
					>{@render avatar(p.author.avatar, 'size-4')}{p.author.login}</GhLink
				>
				{#if external}<ExternalBadge contributor={external} class="py-0 text-[0.7rem]" />{/if}
				<span>opened {ago(p.createdAt)}</span>
				{#if p.pr}
					<span class="opacity-50">·</span>
					<a
						href="{itemPagePath(p.repo, p.number, 'pr')}/{FILES_TAB}"
						class="flex items-center gap-2 underline-offset-2 hover:text-foreground hover:underline"
					>
						<span class="text-signal-merge tabular-nums">+{p.pr.additions}</span>
						<span class="text-signal-fail tabular-nums">−{p.pr.deletions}</span>
						<span>{p.pr.files} {p.pr.files === 1 ? 'file' : 'files'}</span>
					</a>
				{/if}
			</div>
			{#if p.pr}
				{@const { base, head, headRepo } = p.pr}
				{@const fromFork = !!headRepo && headRepo !== p.repo}
				{@const headLabel = fromFork ? `${headRepo?.split('/')[0]}:${head}` : head}
				<Tip focusable={false} text="{base} ← {headLabel}">
					{#snippet children(props)}
						<p {...props} class="truncate font-mono text-[0.7rem] text-muted-foreground">
							<GhLink href={branchUrl(p.repo, base)}>{base}</GhLink> ←
							{#if headRepo}<GhLink href={branchUrl(headRepo, head)}>{headLabel}</GhLink
								>{:else}{headLabel}{/if}
						</p>
					{/snippet}
				</Tip>
			{/if}
			{#if p.labels.length}
				<div class="flex flex-wrap gap-1">
					{#each p.labels as l (l.name)}
						<a
							href={labelUrl(p.repo, l.name)}
							target="_blank"
							rel="noreferrer"
							class="rounded-full border px-2 py-0.5 text-[0.7rem] hover:brightness-95 dark:hover:brightness-125"
							style="border-color: #{l.color}80; background: #{l.color}1f">{l.name}</a
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
						<p class="text-muted-foreground">No approvals or change requests yet.</p>
					{/if}
					{#each pr.reviews as r (r.who.login)}
						{@const rv = REVIEW[r.state] ?? REVIEW.COMMENTED}
						<div class="flex items-center gap-2">
							<GhLink
								href={profileUrl(r.who.login, r.who.bot)}
								class="flex min-w-0 items-center gap-2"
								>{@render avatar(r.who.avatar)}<span class="truncate">{r.who.login}</span></GhLink
							>
							<span class={cn('ml-auto shrink-0', rv.tone)}>{rv.label}</span>
						</div>
					{/each}
					{#each pr.requested as r (r.name)}
						{@const requestedUrl = r.team ? (r.slug ? teamUrl(r.slug) : null) : profileUrl(r.name)}
						<div class="flex items-center gap-2">
							{#if r.team}<Users class="size-5 p-0.5 text-muted-foreground" />{:else}<span
									class="size-5 rounded-full border border-dashed"
								></span>{/if}
							{#if requestedUrl}
								<Tip text={r.slug}>
									{#snippet children(props)}
										<GhLink {...props} href={requestedUrl} class="truncate">{r.name}</GhLink>
									{/snippet}
								</Tip>
							{:else}
								<span class="truncate">{r.name}</span>
							{/if}
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
				{#if p.can.update}
					<div class="gh-html" {@attach descriptionTasks(p.can.id, p.body)}>
						{@html sanitize(p.html, { editableTasks: true })}
					</div>
				{:else}
					<div class="gh-html">{@html sanitize(p.html)}</div>
				{/if}
			{:else}
				<p class="text-sm text-muted-foreground italic">No description.</p>
			{/if}
			{#if p.reactions}<ReactionBar r={p.reactions} class="mt-3" />{/if}
		</section>

		<section class="grid" bind:this={activity}>
			<h3 class="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
				<MessageSquare class="size-3.5" />Activity
				{#if hiddenOlder && p.timeline.before}
					<button
						type="button"
						class="ml-auto font-normal underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
						disabled={olderLoadingFor === shownSubject}
						onclick={() => loadOlder(p)}
					>
						{#if olderLoadingFor === shownSubject}
							Loading…
						{:else if hiddenOlder > PEEK_TIMELINE_PAGE}
							Show {PEEK_TIMELINE_PAGE} older of {hiddenOlder}
						{:else}
							Show {hiddenOlder} older
						{/if}
					</button>
				{:else if hiddenOlder}
					<a
						href={p.url}
						target="_blank"
						rel="noreferrer"
						class="ml-auto flex items-center gap-1 font-normal hover:text-foreground"
						>{hiddenOlder} older on GitHub<ExternalLink class="size-3" /></a
					>
				{/if}
			</h3>
			{#if olderError?.subject === shownSubject}
				<p class="pb-3 text-xs text-signal-fail" role="alert">
					Could not load older activity: {olderError.message}
				</p>
			{/if}
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
				{@const reviewThreads = e.type === 'review' ? (threadsOfReview.get(e.id) ?? []) : []}
				{@const canEdit =
					e.canEdit && typeof e.body === 'string' && (e.type !== 'review' || !!e.body.trim())}
				{@const showReactions = e.reactions && (e.html.trim() || e.reactions.groups.length)}
				<div
					class="grid gap-1.5 pb-3"
					data-peek-entry
					in:revealEntry={{ instant: prependingOlder }}
				>
					<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
						<GhLink
							href={profileUrl(e.author.login, e.author.bot)}
							class="flex min-w-0 items-center gap-2 font-medium"
							>{@render avatar(e.author.avatar)}<span class="truncate">{e.author.login}</span
							></GhLink
						>
						<span class={cn('shrink-0 text-muted-foreground', tone)}>{entryVerb(e)}</span>
						{#if e.inline}
							<span class="shrink-0 text-muted-foreground"
								>· <a
									href={reviewThreads.length
										? reviewThreadPath(p.repo, p.number, reviewThreads[0])
										: `${itemPagePath(p.repo, p.number, 'pr')}/${FILES_TAB}`}
									class="underline-offset-2 hover:text-foreground hover:underline"
									>{e.inline} on the diff</a
								></span
							>
						{/if}
						<a
							href={e.url}
							target="_blank"
							rel="noreferrer"
							class="ml-auto shrink-0 text-muted-foreground tabular-nums hover:text-foreground"
							>{ago(e.at)}</a
						>
					</div>
					{#if editingId === e.id}
						<CommentEditor entry={e} repo={p.repo} number={p.number} onclose={closeEditor} />
					{:else if e.html.trim()}
						<div
							class="gh-html ml-7 rounded-lg bg-muted/50 px-3 py-2"
							{@attach e.canUpdate ? entryTasks(e.id, e.body ?? '') : undefined}
						>
							{@html sanitize(e.html, { editableTasks: !!e.canUpdate })}
						</div>
					{/if}
					{#if showReactions || canEdit}
						<div hidden={editingId === e.id} class="ml-7 flex flex-wrap items-center gap-1">
							{#if showReactions && e.reactions}
								<ReactionBar r={e.reactions} />
							{/if}
							{#if canEdit}
								<Tip text="Edit comment">
									{#snippet children(props)}
										<button
											{...props}
											type="button"
											class="ml-auto flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
											disabled={editingId !== null}
											aria-label="Edit comment"
											aria-expanded={editingId === e.id}
											onclick={(event) => {
												editTrigger = event.currentTarget;
												editingId = e.id;
											}}
										>
											<Pencil class="size-3.5" />
										</button>
									{/snippet}
								</Tip>
							{/if}
						</div>
					{/if}
					{#if e.type === 'review' && e.inline}
						{#if threadsQ.isPending}
							<Skeleton class="ml-7 h-20" />
						{:else if reviewThreads.length}
							<div class="ml-7 grid gap-2">
								{#each reviewThreads as thread (thread.id)}
									<ReviewThread
										{thread}
										onchanged={refreshThreads}
										diffHref={reviewThreadPath(p.repo, p.number, thread)}
									/>
								{/each}
							</div>
						{/if}
					{/if}
				</div>
			{/each}
			<CommentBox {p} />
			<div bind:this={composerEnd}></div>
		</section>
	</article>
{/if}
