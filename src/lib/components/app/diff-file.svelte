<script lang="ts">
	import {
		fileAnchor,
		parsePatch,
		splitPath,
		type DiffLineKind,
		type FileViewedState,
		type FoldReason,
		type PullFile,
		type PullFileStatus
	} from '$lib/shared/diff';
	import { cn } from '$lib/utils';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ExternalLink from '@lucide/svelte/icons/external-link';

	let {
		file,
		folded,
		foldReason,
		current,
		viewedState,
		ontoggle,
		onviewed
	}: {
		file: PullFile;
		folded: boolean;
		foldReason: FoldReason;
		current: boolean;
		viewedState: FileViewedState | undefined;
		ontoggle: () => void;
		onviewed: () => void;
	} = $props();

	const hunks = $derived(folded || !file.patch ? [] : parsePatch(file.patch));
	const path = $derived(splitPath(file.filename));

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
</script>

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
			<p class="px-3 py-2 text-xs text-muted-foreground">
				{FOLD_NOTE[foldReason]}
				<button type="button" class="underline underline-offset-2" onclick={ontoggle}
					>Show the diff</button
				>
			</p>
		{/if}
	{:else if !file.patch}
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
		<div class="overflow-x-auto">
			<table class="w-full border-collapse font-mono text-xs leading-5">
				{#each hunks as hunk, h (h)}
					<tbody>
						<tr class="bg-signal-reply/8 text-muted-foreground">
							<td colspan="3" class="px-2 py-0.5 whitespace-pre"
								>@@ −{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@ {hunk.section}</td
							>
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
									><span class="inline-block w-4 text-center text-muted-foreground select-none"
										>{PREFIX[line.kind]}</span
									>{line.text}</td
								>
							</tr>
						{/each}
					</tbody>
				{/each}
			</table>
		</div>
	{/if}
</section>
