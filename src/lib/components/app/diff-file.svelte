<script lang="ts">
	import {
		fileAnchor,
		languageForPath,
		lineAnchors,
		parsePatch,
		placeThreads,
		splitPath,
		splitRows,
		type DiffHunk,
		type DiffLine,
		type DiffLineKind,
		type FileViewedState,
		type FoldReason,
		type PullFile,
		type PullFileStatus,
		type ReviewThread as ReviewThreadData
	} from '$lib/shared/diff';
	import { untrack } from 'svelte';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { cn } from '$lib/utils';
	import { highlightHunks, type HighlightedToken } from '$lib/highlight';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import ReviewThread from './review-thread.svelte';

	let {
		file,
		folded,
		foldReason,
		current,
		viewedState,
		split,
		threads,
		ontoggle,
		onviewed,
		onthreadschanged
	}: {
		file: PullFile;
		folded: boolean;
		foldReason: FoldReason;
		current: boolean;
		viewedState: FileViewedState | undefined;
		split: boolean;
		threads: ReviewThreadData[];
		ontoggle: () => void;
		onviewed: () => void;
		onthreadschanged: () => Promise<unknown>;
	} = $props();

	const FOLD_MS = 220;
	const hunks = $derived(file.patch ? parsePatch(file.patch) : []);
	const foldMotion = $derived({
		duration: prefersReducedMotion.current ? 0 : FOLD_MS,
		easing: cubicOut
	});
	const path = $derived(splitPath(file.filename));
	const placed = $derived(placeThreads(threads, hunks));
	const THREAD_MAX_WIDTH_PX = 768;
	const THREAD_INSET_PX = 16;
	let visibleWidth = $state(THREAD_MAX_WIDTH_PX + THREAD_INSET_PX);
	const openThreadCount = $derived(threads.filter((t) => !t.resolved).length);
	function threadsAt(lines: (DiffLine | undefined)[]): ReviewThreadData[] {
		const anchors = new Set(lines.flatMap((line) => (line ? lineAnchors(line) : [])));
		return [...anchors].flatMap((anchor) => placed.atLine.get(anchor) ?? []);
	}
	const language = $derived(languageForPath(file.filename));

	let highlighted = $state<{ hunks: DiffHunk[]; tokens: HighlightedToken[][][] | null } | null>(
		null
	);
	const tokens = $derived(highlighted?.hunks === hunks ? highlighted.tokens : null);
	$effect(() => {
		const forHunks = hunks;
		const forLanguage = language;
		if (folded || !forLanguage || !forHunks.length) return;
		if (untrack(() => highlighted?.hunks === forHunks)) return;
		let current = true;
		void highlightHunks(forHunks, forLanguage)
			.then((result) => {
				if (current) highlighted = { hunks: forHunks, tokens: result };
			})
			.catch(() => {});
		return () => {
			current = false;
		};
	});

	const STATUS_LABEL: Partial<Record<PullFileStatus, { label: string; tone: string }>> = {
		added: { label: 'Added', tone: 'text-signal-merge' },
		removed: { label: 'Deleted', tone: 'text-signal-fail' },
		renamed: { label: 'Renamed', tone: 'text-signal-reply' },
		copied: { label: 'Copied', tone: 'text-signal-reply' }
	};
	const FOLD_NOTE: Record<Exclude<FoldReason, null>, string> = {
		generated: 'A lock file or generated file.',
		large: 'A large diff.',
		deleted: 'A deleted file.',
		viewed: 'You viewed this file.'
	};
	const ROW_TONE: Record<DiffLineKind, string> = {
		add: 'bg-signal-merge/10',
		del: 'bg-signal-fail/10',
		context: '',
		note: 'text-muted-foreground italic'
	};
	const NUMBER_TONE: Record<DiffLineKind, string> = {
		add: 'bg-signal-merge/15',
		del: 'bg-signal-fail/15',
		context: '',
		note: ''
	};
	const PREFIX: Record<DiffLineKind, string> = { add: '+', del: '−', context: ' ', note: ' ' };
	const status = $derived(STATUS_LABEL[file.status]);
	const hunkHeader = (hunk: (typeof hunks)[number]) =>
		`@@ −${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@ ${hunk.section}`;
</script>

{#snippet code(line: DiffLine, h: number, l: number)}{@const lineTokens =
		tokens?.[h]?.[l]}{#if lineTokens?.length}{#each lineTokens as token, k (k)}<span
				style:color={token.color}
				class={token.italic ? 'italic' : undefined}>{token.content}</span
			>{/each}{:else}{line.text}{/if}{/snippet}

{#snippet threadRow(lineThreads: ReviewThreadData[], columns: number)}
	{#if lineThreads.length}
		<tr>
			<td colspan={columns} class="px-2">
				<div
					class="sticky left-2"
					style:max-width="{Math.min(THREAD_MAX_WIDTH_PX, visibleWidth - THREAD_INSET_PX)}px"
				>
					{#each lineThreads as thread (thread.id)}
						<ReviewThread {thread} onchanged={onthreadschanged} />
					{/each}
				</div>
			</td>
		</tr>
	{/if}
{/snippet}

{#snippet splitHalf(cell: { line: DiffLine; at: number } | null, h: number, side: 'old' | 'new')}
	{#if cell}
		{@const tone = cell.line.kind === 'context' ? '' : ROW_TONE[cell.line.kind]}
		<td
			class={cn(
				'px-2 text-right align-top text-muted-foreground tabular-nums select-none',
				cell.line.kind === 'context' ? '' : NUMBER_TONE[cell.line.kind]
			)}>{(side === 'old' ? cell.line.oldLine : cell.line.newLine) ?? ''}</td
		>
		<td class={cn('pr-3 align-top break-all whitespace-pre-wrap', tone)}
			>{@render code(cell.line, h, cell.at)}</td
		>
	{:else}
		<td class="bg-muted/40"></td>
		<td class="bg-muted/40"></td>
	{/if}
{/snippet}

<section
	id={fileAnchor(file.filename)}
	class={cn(
		'scroll-mt-28 rounded-lg border [contain-intrinsic-size:auto_20rem] [content-visibility:auto]',
		current && 'ring-1 ring-ring/40'
	)}
	aria-label={file.filename}
>
	<header
		class={cn(
			'flex min-w-0 items-center gap-2 bg-muted/40 px-2 py-1.5 text-xs',
			folded ? 'rounded-lg' : 'rounded-t-lg border-b'
		)}
	>
		<button
			type="button"
			class="flex min-w-0 flex-1 items-center gap-1.5 text-left"
			aria-expanded={!folded}
			onclick={ontoggle}
		>
			<ChevronRight class={cn('size-3.5 shrink-0 transition-transform', !folded && 'rotate-90')} />
			<span class="flex min-w-0 font-mono" title={file.filename}>
				<span class="min-w-0 truncate text-muted-foreground"
					>{#if file.previous_filename}{file.previous_filename} →
					{/if}{path.directory}</span
				><span class="max-w-full shrink-0 truncate font-medium text-foreground">{path.name}</span>
			</span>
		</button>
		{#if threads.length}
			<span
				class={cn(
					'flex shrink-0 items-center gap-1 tabular-nums',
					openThreadCount ? 'text-signal-reply' : 'text-muted-foreground'
				)}
				title="{openThreadCount} open of {threads.length} review threads"
				><MessageSquare class="size-3.5" />{openThreadCount || threads.length}</span
			>
		{/if}
		{#if status}<span class={cn('shrink-0', status.tone)}>{status.label}</span>{/if}
		<span class="shrink-0 text-signal-merge tabular-nums">+{file.additions}</span>
		<span class="shrink-0 text-signal-fail tabular-nums">−{file.deletions}</span>
		{#if viewedState === 'DISMISSED'}
			<span class="shrink-0 text-signal-warn"
				><span class="hidden sm:inline">Changed since you viewed it</span><span class="sm:hidden"
					>Changed</span
				></span
			>
		{/if}
		<label class="flex shrink-0 cursor-pointer items-center gap-1.5 text-muted-foreground">
			<Checkbox
				checked={viewedState === 'VIEWED'}
				onCheckedChange={onviewed}
				aria-label="Viewed: {file.filename}"
			/>
			<span class="hidden sm:inline">Viewed</span>
		</label>
		{#if file.blob_url}
			<a
				href={file.blob_url}
				target="_blank"
				rel="noreferrer"
				class="shrink-0 text-muted-foreground hover:text-foreground"
				aria-label="Open {file.filename} on GitHub"><ExternalLink class="size-3.5" /></a
			>
		{/if}
	</header>

	{#if folded}
		{#if foldReason}
			<p class="px-3 py-2 text-xs text-muted-foreground" transition:slide={foldMotion}>
				{FOLD_NOTE[foldReason]}
				<button type="button" class="underline underline-offset-2" onclick={ontoggle}
					>Show the diff</button
				>
			</p>
		{/if}
	{:else}
		<div transition:slide={foldMotion}>
			{#if !file.patch}
				<p class="px-3 py-2 text-xs text-muted-foreground">
					GitHub shows no diff for this file: it is binary, too large, or only renamed.
					{#if file.blob_url}<a
							class="underline underline-offset-2"
							href={file.blob_url}
							target="_blank"
							rel="noreferrer">Open it on GitHub</a
						>{/if}
				</p>
			{:else}
				{#if placed.atTop.length}
					<div class="border-b px-2">
						{#each placed.atTop as thread (thread.id)}
							<ReviewThread {thread} onchanged={onthreadschanged} />
						{/each}
					</div>
				{/if}
				{#if split}
					<table class="w-full table-fixed border-collapse font-mono text-xs leading-5">
						<colgroup>
							<col class="w-14" />
							<col />
							<col class="w-14" />
							<col />
						</colgroup>
						{#each hunks as hunk, h (h)}
							<tbody>
								<tr class="bg-signal-reply/8 text-muted-foreground">
									<td colspan="4" class="truncate px-2 py-0.5 whitespace-pre">{hunkHeader(hunk)}</td
									>
								</tr>
								{#each splitRows(hunk) as row, r (r)}
									<tr>
										{@render splitHalf(row.left, h, 'old')}
										{@render splitHalf(row.right, h, 'new')}
									</tr>
									{@render threadRow(threadsAt([row.left?.line, row.right?.line]), 4)}
								{/each}
							</tbody>
						{/each}
					</table>
				{:else}
					<div class="overflow-x-auto" bind:clientWidth={visibleWidth}>
						<table class="w-full border-collapse font-mono text-xs leading-5">
							{#each hunks as hunk, h (h)}
								<tbody>
									<tr class="bg-signal-reply/8 text-muted-foreground">
										<td colspan="3" class="px-2 py-0.5 whitespace-pre">{hunkHeader(hunk)}</td>
									</tr>
									{#each hunk.lines as line, l (l)}
										<tr class={ROW_TONE[line.kind]}>
											<td
												class={cn(
													'w-px px-2 text-right text-muted-foreground tabular-nums select-none',
													NUMBER_TONE[line.kind]
												)}>{line.oldLine ?? ''}</td
											>
											<td
												class={cn(
													'w-px px-2 text-right text-muted-foreground tabular-nums select-none',
													NUMBER_TONE[line.kind]
												)}>{line.newLine ?? ''}</td
											>
											<td class="pr-4 whitespace-pre"
												><span
													class="inline-block w-4 text-center text-muted-foreground select-none"
													>{PREFIX[line.kind]}</span
												>{@render code(line, h, l)}</td
											>
										</tr>
										{@render threadRow(threadsAt([line]), 3)}
									{/each}
								</tbody>
							{/each}
						</table>
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</section>
