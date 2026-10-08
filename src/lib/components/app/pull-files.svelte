<script lang="ts">
	import { tick } from 'svelte';
	import { MediaQuery, SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { createQuery } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { commandFor } from '$lib/keys.svelte';
	import {
		commitDiffQuery,
		keys,
		pullCommitsQuery,
		pullCompareQuery,
		pullFilesQuery,
		pullViewedQuery,
		queryClient,
		reviewThreadsQuery
	} from '$lib/queries';
	import { ago } from '$lib/time';
	import { goto } from '$app/navigation';
	import {
		PULL_FILES_MAX_PAGES,
		PULL_FILES_PER_PAGE,
		buildFileTree,
		comparesOnlyNewCommits,
		fileAnchor,
		filesInTreeOrder,
		foldedByDefault,
		rangeSinceReview,
		threadsByPath,
		type ReviewRange,
		type FileTreeNode,
		type PullFile,
		type ReviewThread,
		type ViewedFiles
	} from '$lib/shared/diff';
	import { cn } from '$lib/utils';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import DiffFile from './diff-file.svelte';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Folder from '@lucide/svelte/icons/folder';
	import FolderOpen from '@lucide/svelte/icons/folder-open';
	import FileIcon from '@lucide/svelte/icons/file';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import FileCheck from '@lucide/svelte/icons/file-check';
	import FileDiff from '@lucide/svelte/icons/file-diff';

	let {
		repo,
		number,
		pullRequestId,
		head,
		lastReview,
		changedFiles,
		additions,
		deletions
	}: {
		repo: string;
		number: number;
		pullRequestId: string;
		head: string;
		lastReview: { oid: string; at: string } | null;
		changedFiles: number;
		additions: number;
		deletions: number;
	} = $props();

	const MAX_LISTED_FILES = PULL_FILES_PER_PAGE * PULL_FILES_MAX_PAGES;
	const LAYOUT_KEY = 'hush:diff-layout';
	const SPLIT_LAYOUT = 'split';

	const wide = new MediaQuery('min-width: 1024px');
	let splitChosen = $state(browser && localStorage.getItem(LAYOUT_KEY) === SPLIT_LAYOUT);
	const split = $derived(splitChosen && wide.current);
	function setSplit(on: boolean) {
		splitChosen = on;
		if (on) localStorage.setItem(LAYOUT_KEY, SPLIT_LAYOUT);
		else localStorage.removeItem(LAYOUT_KEY);
	}
	const SINCE_PARAM = 'since';
	const SINCE_REVIEW = 'review';

	const reviewBase = $derived(lastReview && lastReview.oid !== head ? lastReview : null);
	const sinceReview = $derived(
		!!reviewBase && page.url.searchParams.get(SINCE_PARAM) === SINCE_REVIEW
	);
	function rangeHref(onlySinceReview: boolean) {
		const url = new URL(page.url);
		if (onlySinceReview) url.searchParams.set(SINCE_PARAM, SINCE_REVIEW);
		else url.searchParams.delete(SINCE_PARAM);
		url.hash = '';
		return url.pathname + url.search;
	}

	const COMMIT_PARAM = 'commit';

	const allQ = createQuery(() => pullFilesQuery(repo, number, head, changedFiles));
	const commitsQ = createQuery(() => ({
		...pullCommitsQuery(repo, number, head),
		enabled: sinceReview
	}));
	const range = $derived<ReviewRange | null>(
		sinceReview && reviewBase && commitsQ.data
			? rangeSinceReview(commitsQ.data.commits, reviewBase.oid)
			: null
	);
	const compareQ = createQuery(() => ({
		...pullCompareQuery(repo, number, reviewBase?.oid ?? '', head),
		enabled: range?.kind === 'combined'
	}));
	const pickedCommit = $derived.by(() => {
		if (range?.kind !== 'by-commit') return null;
		const wanted = page.url.searchParams.get(COMMIT_PARAM);
		return range.commits.find((c) => c.oid === wanted) ?? range.commits[0] ?? null;
	});
	const commitQ = createQuery(() => ({
		...commitDiffQuery(repo, number, pickedCommit?.oid ?? ''),
		enabled: !!pickedCommit
	}));

	const historyRewritten = $derived(
		sinceReview &&
			(commitsQ.isError ||
				range?.kind === 'reviewed-commit-missing' ||
				compareQ.isError ||
				(!!compareQ.data && !comparesOnlyNewCommits(compareQ.data.status)))
	);
	const showingCombined = $derived(
		range?.kind === 'combined' && !historyRewritten && !!compareQ.data
	);
	const showingCommit = $derived(range?.kind === 'by-commit' && !historyRewritten);
	const showingSinceReview = $derived(showingCombined || showingCommit);
	const q = $derived(
		!sinceReview || historyRewritten || range?.kind === 'all'
			? allQ
			: range?.kind === 'by-commit'
				? range.commits.length
					? commitQ
					: allQ
				: range?.kind === 'combined'
					? compareQ
					: commitsQ
	);
	const shownFiles = $derived<PullFile[]>(
		showingCombined
			? (compareQ.data?.files ?? [])
			: showingCommit
				? (commitQ.data?.files ?? [])
				: (allQ.data ?? [])
	);
	const sumOf = (pick: (f: PullFile) => number) => shownFiles.reduce((sum, f) => sum + pick(f), 0);
	const shownAdditions = $derived(showingSinceReview ? sumOf((f) => f.additions) : additions);
	const shownDeletions = $derived(showingSinceReview ? sumOf((f) => f.deletions) : deletions);
	const shownFileCount = $derived(showingSinceReview ? shownFiles.length : changedFiles);

	function commitHref(oid: string) {
		const url = new URL(page.url);
		url.searchParams.set(COMMIT_PARAM, oid);
		url.hash = '';
		return url.pathname + url.search;
	}

	const threadsQ = createQuery(() => reviewThreadsQuery(repo, number));
	const NO_THREADS: ReviewThread[] = [];
	const threadsOfFile = $derived(
		showingSinceReview
			? new Map<string, ReviewThread[]>()
			: threadsByPath(threadsQ.data?.threads ?? [])
	);
	const fileThreads = (file: PullFile) => threadsOfFile.get(file.filename) ?? NO_THREADS;
	const openThreadsOf = (file: PullFile) => fileThreads(file).filter((t) => !t.resolved).length;
	const refreshThreads = () =>
		queryClient.refetchQueries({ queryKey: keys.reviewThreads(repo, number) });

	const viewedQ = createQuery(() => pullViewedQuery(repo, number));
	const viewed = $derived<ViewedFiles>(viewedQ.data?.viewed ?? {});
	const isViewed = (file: PullFile) => viewed[file.filename] === 'VIEWED';
	const viewedCount = $derived(shownFiles.filter(isViewed).length);

	async function toggleViewed(file: PullFile) {
		const key = keys.pullViewed(repo, number);
		const before = viewed;
		const nowViewed = !isViewed(file);
		const next = { ...before };
		if (nowViewed) next[file.filename] = 'VIEWED';
		else delete next[file.filename];
		queryClient.setQueryData(key, { viewed: next });
		foldChoices.set(file.filename, nowViewed);
		try {
			await api.setFileViewed(pullRequestId, file.filename, nowViewed);
		} catch (err) {
			queryClient.setQueryData(key, { viewed: before });
			foldChoices.delete(file.filename);
			toast.error((err as Error).message, { description: file.filename });
		}
	}

	const tree = $derived(buildFileTree(shownFiles));
	const files = $derived(filesInTreeOrder(tree));
	const indexByFilename = $derived(new Map(files.map((f, i) => [f.filename, i])));

	const TREE_INDENT_PX = 12;
	const TREE_GUIDE_OFFSET_PX = 10;
	const closedFolders = new SvelteSet<string>();
	function toggleFolder(path: string) {
		if (closedFolders.has(path)) closedFolders.delete(path);
		else closedFolders.add(path);
	}

	const foldChoices = new SvelteMap<string, boolean>();
	const foldReason = (file: PullFile) => (isViewed(file) ? 'viewed' : foldedByDefault(file));
	const isFolded = (file: PullFile) => foldChoices.get(file.filename) ?? !!foldReason(file);
	const toggle = (file: PullFile) => foldChoices.set(file.filename, !isFolded(file));
	function setAllFolded(folded: boolean) {
		for (const file of files) foldChoices.set(file.filename, folded);
	}

	let cursor = $state(-1);

	const SETTLE_MS = 300;

	function reveal(index: number, behavior: ScrollBehavior = 'smooth') {
		const file = files[index];
		if (!file) return;
		cursor = index;
		document
			.getElementById(fileAnchor(file.filename))
			?.scrollIntoView({ block: 'start', behavior });
	}

	function jumpTo(index: number) {
		reveal(index, 'instant');
		setTimeout(() => reveal(index, 'instant'), SETTLE_MS);
	}

	let revealedHash = '';
	$effect(() => {
		const hash = page.url.hash.slice(1);
		if (!hash || hash === revealedHash || !files.length) return;
		const index = files.findIndex((f) => fileAnchor(f.filename) === hash);
		if (index < 0) return;
		revealedHash = hash;
		foldChoices.set(files[index].filename, false);
		void tick().then(() => jumpTo(index));
	});

	function onKey(e: KeyboardEvent) {
		const target = e.target;
		if (
			target instanceof Element &&
			target.closest('input, textarea, [contenteditable], [role="menu"], [role="dialog"]')
		)
			return;
		const cmd = commandFor(e, ['page']);
		const run: Record<string, () => void> = {
			'page.nextFile': () => reveal(Math.min(cursor + 1, files.length - 1)),
			'page.prevFile': () => reveal(Math.max(cursor - 1, 0)),
			'page.foldFile': () => {
				const file = files[Math.max(cursor, 0)];
				if (file) toggle(file);
			},
			'page.splitView': () => wide.current && setSplit(!splitChosen),
			'page.viewFile': () => {
				const file = files[Math.max(cursor, 0)];
				if (file) void toggleViewed(file);
			}
		};
		const fn = cmd ? run[cmd] : undefined;
		if (!fn || !files.length) return;
		e.preventDefault();
		fn();
	}
</script>

<svelte:window onkeydown={onKey} />

{#snippet treeNodes(nodes: FileTreeNode[], depth: number)}
	{#each nodes as node (node.kind === 'file' ? node.file.filename : `${node.path}/`)}
		{#if node.kind === 'folder'}
			{@const open = !closedFolders.has(node.path)}
			{@const FolderIcon = open ? FolderOpen : Folder}
			<li class="grid grid-cols-[minmax(0,1fr)]">
				<button
					type="button"
					class="flex min-w-0 items-center gap-1 rounded-md py-1 pr-2 text-left hover:bg-muted"
					style:padding-left="{depth * TREE_INDENT_PX + 4}px"
					aria-expanded={open}
					title={node.path}
					onclick={() => toggleFolder(node.path)}
				>
					<ChevronRight
						class={cn(
							'size-3 shrink-0 text-muted-foreground transition-transform',
							open && 'rotate-90'
						)}
					/>
					<FolderIcon class="size-3.5 shrink-0 text-muted-foreground" />
					<span class="min-w-0 truncate font-mono">{node.name}</span>
				</button>
				{#if open}
					<ul
						class="relative grid grid-cols-[minmax(0,1fr)] before:absolute before:inset-y-0 before:left-(--tree-guide) before:w-px before:bg-border"
						style:--tree-guide="{depth * TREE_INDENT_PX + TREE_GUIDE_OFFSET_PX}px"
					>
						{@render treeNodes(node.children, depth + 1)}
					</ul>
				{/if}
			</li>
		{:else}
			{@const index = indexByFilename.get(node.file.filename) ?? -1}
			<li class="grid grid-cols-[minmax(0,1fr)]">
				<a
					href="#{fileAnchor(node.file.filename)}"
					onclick={(e) => {
						e.preventDefault();
						foldChoices.set(node.file.filename, false);
						void tick().then(() => reveal(index));
					}}
					class={cn(
						'flex min-w-0 items-center gap-1.5 rounded-md py-1 pr-2 hover:bg-muted',
						index === cursor && 'bg-muted'
					)}
					style:padding-left="{depth * TREE_INDENT_PX + 20}px"
					title={node.file.filename}
				>
					{#if viewed[node.file.filename] === 'VIEWED'}
						<FileCheck class="size-3.5 shrink-0 text-signal-merge" aria-label="Viewed" />
					{:else if viewed[node.file.filename] === 'DISMISSED'}
						<FileDiff
							class="size-3.5 shrink-0 text-signal-warn"
							aria-label="Changed since you viewed it"
						/>
					{:else}
						<FileIcon class="size-3.5 shrink-0 text-muted-foreground" />
					{/if}
					<span
						class={cn(
							'min-w-0 flex-1 truncate font-mono',
							viewed[node.file.filename] === 'VIEWED' && 'text-muted-foreground'
						)}>{node.name}</span
					>
					{#if openThreadsOf(node.file)}
						<span
							class="flex shrink-0 items-center gap-0.5 text-signal-reply tabular-nums"
							title="{openThreadsOf(node.file)} open review threads"
							><MessageSquare class="size-3" />{openThreadsOf(node.file)}</span
						>
					{/if}
					<span class="shrink-0 text-signal-merge tabular-nums">+{node.file.additions}</span>
					<span class="shrink-0 text-signal-fail tabular-nums">−{node.file.deletions}</span>
				</a>
			</li>
		{/if}
	{/each}
{/snippet}

<div class="grid grid-cols-[minmax(0,1fr)] gap-4 px-3 pt-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
	<nav
		aria-label="Changed files"
		class="hidden self-start lg:sticky lg:top-[6.5rem] lg:block lg:max-h-[calc(100dvh-10rem)] lg:overflow-y-auto"
	>
		<ul class="grid grid-cols-[minmax(0,1fr)] text-xs">
			{@render treeNodes(tree, 0)}
		</ul>
	</nav>

	<div class="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3">
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
			{#if reviewBase}
				<nav aria-label="Changes to show" class="flex items-center rounded-md border p-0.5">
					<a
						href={rangeHref(false)}
						data-sveltekit-replacestate
						data-sveltekit-noscroll
						aria-current={sinceReview ? undefined : 'page'}
						class={cn(
							'rounded px-2 py-0.5 hover:text-foreground',
							!sinceReview && 'bg-muted text-foreground'
						)}>All changes</a
					>
					<a
						href={rangeHref(true)}
						data-sveltekit-replacestate
						data-sveltekit-noscroll
						aria-current={sinceReview ? 'page' : undefined}
						title="Since your review {ago(reviewBase.at)}"
						class={cn(
							'rounded px-2 py-0.5 hover:text-foreground',
							sinceReview && 'bg-muted text-foreground'
						)}>Since your review</a
					>
				</nav>
			{/if}
			<span
				>{shownFileCount}
				{shownFileCount === 1 ? 'file' : 'files'}
				{showingCombined && range?.kind === 'combined'
					? `changed in ${range.commits.length} new ${range.commits.length === 1 ? 'commit' : 'commits'}`
					: showingCommit
						? 'changed in this commit'
						: 'changed'}
				<span class="text-signal-merge tabular-nums">+{shownAdditions}</span>
				<span class="text-signal-fail tabular-nums">−{shownDeletions}</span></span
			>
			{#if shownFiles.length}
				<span class="tabular-nums">{viewedCount} of {shownFiles.length} viewed</span>
			{/if}
			{#if files.length}
				<span class="ml-auto flex items-center gap-3">
					{#if wide.current}
						<span
							class="flex items-center rounded-md border p-0.5"
							role="group"
							aria-label="Layout"
						>
							<button
								type="button"
								aria-pressed={!split}
								class={cn(
									'rounded px-2 py-0.5 hover:text-foreground',
									!split && 'bg-muted text-foreground'
								)}
								onclick={() => setSplit(false)}>Unified</button
							>
							<button
								type="button"
								aria-pressed={split}
								class={cn(
									'rounded px-2 py-0.5 hover:text-foreground',
									split && 'bg-muted text-foreground'
								)}
								onclick={() => setSplit(true)}>Split</button
							>
						</span>
					{/if}
					<button
						type="button"
						class="underline-offset-2 hover:text-foreground hover:underline"
						onclick={() => setAllFolded(false)}>Unfold all</button
					>
					<button
						type="button"
						class="underline-offset-2 hover:text-foreground hover:underline"
						onclick={() => setAllFolded(true)}>Fold all</button
					>
				</span>
			{/if}
		</div>
		{#if historyRewritten}
			<p class="rounded-md border border-signal-warn/40 bg-signal-warn/10 px-3 py-2 text-xs">
				Hush cannot find the commit that you reviewed in the branch any more (for example, after a
				force push). These are all the changes.
			</p>
		{:else if showingCommit && range?.kind === 'by-commit'}
			<div
				class="grid gap-2 rounded-md border border-signal-reply/30 bg-signal-reply/8 px-3 py-2 text-xs"
			>
				<p>
					The branch merged its base branch after your review, so Hush shows the new commits one at
					a time. Merge commits are left out.
				</p>
				{#if range.commits.length}
					<label class="flex min-w-0 items-center gap-2">
						<span class="shrink-0 text-muted-foreground">Commit</span>
						<select
							class="min-w-0 flex-1 truncate rounded-md border bg-background px-2 py-1"
							value={pickedCommit?.oid}
							onchange={(e) =>
								goto(commitHref(e.currentTarget.value), {
									replaceState: true,
									noScroll: true,
									keepFocus: true
								})}
						>
							{#each range.commits as c, i (c.oid)}
								<option value={c.oid}
									>{i + 1} of {range.commits.length}: {c.headline} ({c.oid.slice(0, 7)})</option
								>
							{/each}
						</select>
					</label>
				{:else}
					<p class="text-muted-foreground">There are no new commits other than merges.</p>
				{/if}
			</div>
		{/if}
		{#if !showingSinceReview && changedFiles > MAX_LISTED_FILES}
			<p class="text-xs text-muted-foreground">
				GitHub lists only the first {MAX_LISTED_FILES.toLocaleString()} files.
			</p>
		{/if}

		{#if q.isPending}
			<Skeleton class="h-8 w-full" />
			<Skeleton class="h-48 w-full" />
			<Skeleton class="h-8 w-full" />
		{:else if q.isError}
			<p class="text-sm">
				Hush cannot show the changes. <span class="text-muted-foreground">{q.error.message}</span>
			</p>
		{:else}
			{#each files as file, i (file.filename)}
				<DiffFile
					{file}
					folded={isFolded(file)}
					foldReason={foldReason(file)}
					current={i === cursor}
					viewedState={viewed[file.filename]}
					{split}
					threads={fileThreads(file)}
					onthreadschanged={refreshThreads}
					ontoggle={() => {
						cursor = i;
						toggle(file);
					}}
					onviewed={() => {
						cursor = i;
						void toggleViewed(file);
					}}
				/>
			{/each}
		{/if}
	</div>
</div>
