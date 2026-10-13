<script lang="ts">
	import { highlightHunks, type HighlightedToken } from '$lib/highlight';
	import { DIFF_LINE_PREFIX, DIFF_NUMBER_TONE, DIFF_ROW_TONE } from '$lib/diff-tones';
	import { languageForPath, type DiffLine } from '$lib/shared/diff';
	import { cn } from '$lib/utils';

	let { lines, path }: { lines: DiffLine[]; path: string } = $props();

	const language = $derived(languageForPath(path));
	let highlighted = $state.raw<{ lines: DiffLine[]; tokens: HighlightedToken[][] } | null>(null);
	const tokens = $derived(highlighted?.lines === lines ? highlighted.tokens : null);

	$effect(() => {
		const forLines = lines;
		const forLanguage = language;
		if (!forLanguage || !forLines.length) return;
		let current = true;
		void highlightHunks([{ lines: $state.snapshot(forLines) }], forLanguage)
			.then((result) => {
				if (current && result?.[0]) highlighted = { lines: forLines, tokens: result[0] };
			})
			.catch(() => {});
		return () => {
			current = false;
		};
	});
</script>

<div class="overflow-hidden rounded-md border font-mono text-xs leading-5">
	<table class="w-full border-collapse">
		<tbody>
			{#each lines as line, l (l)}
				{@const numberTone = cn(
					'w-px px-2 text-right align-top text-muted-foreground tabular-nums select-none',
					DIFF_NUMBER_TONE[line.kind]
				)}
				<tr class={DIFF_ROW_TONE[line.kind]}>
					<td class={numberTone}>{line.oldLine ?? ''}</td>
					<td class={numberTone}>{line.newLine ?? ''}</td>
					<td class="w-4 text-center align-top text-muted-foreground select-none"
						>{DIFF_LINE_PREFIX[line.kind]}</td
					>
					<td class="pr-3 align-top wrap-anywhere whitespace-pre-wrap"
						>{#if tokens?.[l]?.length}{#each tokens[l] as token, k (k)}<span
									style:color={token.color}
									class={token.italic ? 'italic' : undefined}>{token.content}</span
								>{/each}{:else}{line.text}{/if}</td
					>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
