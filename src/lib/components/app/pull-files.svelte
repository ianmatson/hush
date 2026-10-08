<script lang="ts">
	import { tick } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { page } from '$app/state';
	import { createQuery } from '@tanstack/svelte-query';
	import { commandFor } from '$lib/keys.svelte';
	import { pullFilesQuery } from '$lib/queries';
	import {
		PULL_FILES_MAX_PAGES,
		PULL_FILES_PER_PAGE,
		buildFileTree,
		fileAnchor,
		filesInTreeOrder,
		foldedByDefault,
		type FileTreeNode,
		type PullFile
	} from '$lib/shared/diff';
	import { cn } from '$lib/utils';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import DiffFile from './diff-file.svelte';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Folder from '@lucide/svelte/icons/folder';
	import FolderOpen from '@lucide/svelte/icons/folder-open';
	import FileIcon from '@lucide/svelte/icons/file';

	let {
		repo,
		number,
		head,
		changedFiles,
		additions,
		deletions
	}: {
		repo: string;
		number: number;
		head: string;
		changedFiles: number;
		additions: number;
		deletions: number;
	} = $props();

	const MAX_LISTED_FILES = PULL_FILES_PER_PAGE * PULL_FILES_MAX_PAGES;

	const q = createQuery(() => pullFilesQuery(repo, number, head, changedFiles));
	const tree = $derived(buildFileTree(q.data ?? []));
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
	const isFolded = (file: PullFile) => foldChoices.get(file.filename) ?? !!foldedByDefault(file);
	const toggle = (file: PullFile) => foldChoices.set(file.filename, !isFolded(file));
	function setAllFolded(folded: boolean) {
		for (const file of files) foldChoices.set(file.filename, folded);
	}

	let cursor = $state(-1);

	function reveal(index: number) {
		const file = files[index];
		if (!file) return;
		cursor = index;
		document
			.getElementById(fileAnchor(file.filename))
			?.scrollIntoView({ block: 'start', behavior: 'smooth' });
	}

	let revealedHash = '';
	$effect(() => {
		const hash = page.url.hash.slice(1);
		if (!hash || hash === revealedHash || !files.length) return;
		const index = files.findIndex((f) => fileAnchor(f.filename) === hash);
		if (index < 0) return;
		revealedHash = hash;
		foldChoices.set(files[index].filename, false);
		void tick().then(() => reveal(index));
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
					<FileIcon class="size-3.5 shrink-0 text-muted-foreground" />
					<span class="min-w-0 flex-1 truncate font-mono">{node.name}</span>
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
			<span
				>{changedFiles}
				{changedFiles === 1 ? 'file' : 'files'} changed
				<span class="text-signal-merge tabular-nums">+{additions}</span>
				<span class="text-signal-fail tabular-nums">−{deletions}</span></span
			>
			{#if files.length}
				<span class="ml-auto flex gap-3">
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
		{#if changedFiles > MAX_LISTED_FILES}
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
					foldReason={foldedByDefault(file)}
					current={i === cursor}
					ontoggle={() => {
						cursor = i;
						toggle(file);
					}}
				/>
			{/each}
		{/if}
	</div>
</div>
