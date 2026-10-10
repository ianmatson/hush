<script lang="ts">
	import { untrack } from 'svelte';
	import { clearDraft, loadDraft, saveDraft } from '$lib/drafts';
	import { commandFor, keysOf } from '$lib/keys.svelte';
	import { suggestionBlock, suggestionIn } from '$lib/shared/diff';
	import { Button } from '$lib/components/ui/button';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { cn } from '$lib/utils';
	import { DROP_TARGET_CLASS, Uploads, getAttachTarget } from '$lib/attachments.svelte';
	import AttachButton from './attach-button.svelte';

	let {
		label,
		draftKey,
		selectedText,
		hasPendingReview,
		onsubmit,
		oncancel
	}: {
		label: string;
		draftKey: string;
		selectedText: string | null;
		hasPendingReview: boolean;
		onsubmit: (body: string, single: boolean) => Promise<boolean>;
		oncancel: () => void;
	} = $props();

	let body = $state(untrack(() => loadDraft(draftKey)));
	let sending = $state<'review' | 'single' | null>(null);
	let textarea = $state<HTMLTextAreaElement | null>(null);
	const uploads = new Uploads(getAttachTarget());

	$effect(() => {
		textarea?.focus();
	});
	$effect(() => {
		saveDraft(draftKey, body);
	});

	const suggestion = $derived(suggestionIn(body));

	function addSuggestion() {
		if (selectedText === null) return;
		const block = suggestionBlock(selectedText);
		body = body.trim() ? `${body.trimEnd()}\n\n${block}` : block;
		textarea?.focus();
	}

	async function send(single: boolean) {
		if (!body.trim() || sending || uploads.pending) return;
		sending = single ? 'single' : 'review';
		const posted = await onsubmit(body.trim(), single);
		sending = null;
		if (posted) clearDraft(draftKey);
	}
</script>

<div
	class="my-2 grid gap-2 rounded-lg border bg-background p-3 font-sans text-sm whitespace-normal"
>
	<p class="text-xs text-muted-foreground">{label}</p>
	<textarea
		bind:this={textarea}
		bind:value={body}
		rows="3"
		placeholder="Leave a comment"
		aria-label="Comment on {label}"
		class={cn(
			'min-h-16 w-full resize-y rounded-md border bg-background px-2 py-1.5 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
			DROP_TARGET_CLASS
		)}
		{@attach uploads.textarea}
		onkeydown={(e) => {
			if (commandFor(e, ['editor']) === 'editor.send') {
				e.preventDefault();
				void send(false);
			} else if (e.key === 'Escape') {
				e.preventDefault();
				oncancel();
			}
		}}></textarea>
	{#if suggestion !== null && selectedText !== null}
		<div class="overflow-x-auto rounded-md border font-mono text-xs leading-5">
			<p class="border-b bg-muted/40 px-2 py-1 font-sans text-muted-foreground">Suggested change</p>
			{#each selectedText.split('\n') as line, i (i)}
				<div class="bg-signal-fail/10 px-2 whitespace-pre">− {line}</div>
			{/each}
			{#each suggestion.split('\n') as line, i (i)}
				<div class="bg-signal-merge/10 px-2 whitespace-pre">+ {line}</div>
			{/each}
		</div>
	{/if}
	<div class="flex flex-wrap items-center gap-2">
		<AttachButton {uploads} box={textarea} />
		{#if selectedText !== null}
			<Button size="sm" variant="ghost" onclick={addSuggestion}>Suggest a change</Button>
		{/if}
		<span class="hidden text-xs text-muted-foreground sm:inline"
			>{keysOf('editor.send')[0] ?? ''} to add to the review</span
		>
		<span class="ml-auto flex flex-wrap gap-2">
			<Button size="sm" variant="ghost" onclick={oncancel}>Cancel</Button>
			{#if !hasPendingReview}
				<Button
					size="sm"
					variant="outline"
					disabled={!body.trim() || !!sending || !!uploads.pending}
					onclick={() => void send(true)}
				>
					{#if sending === 'single'}<LoaderCircle class="animate-spin" />{/if}
					Comment now
				</Button>
			{/if}
			<Button
				size="sm"
				disabled={!body.trim() || !!sending || !!uploads.pending}
				onclick={() => void send(false)}
			>
				{#if sending === 'review'}<LoaderCircle class="animate-spin" />{/if}
				{hasPendingReview ? 'Add to review' : 'Start a review'}
			</Button>
		</span>
	</div>
</div>
