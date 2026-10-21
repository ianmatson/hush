<script lang="ts">
	import { untrack } from 'svelte';
	import { markdownEditor } from '$lib/textarea-edit';
	import { api } from '$lib/api';
	import { keys, queryClient, refetchUnlessLive } from '$lib/queries';
	import { commandFor, keysOf } from '$lib/keys.svelte';
	import { DROP_TARGET_CLASS, Uploads, getAttachTarget } from '$lib/attachments.svelte';
	import { MAX_COMMENT_LENGTH } from '$lib/shared/actions';
	import type { PeekDTO, PeekEntry } from '$lib/shared/types';
	import { Button } from '$lib/components/ui/button';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { cn } from '$lib/utils';

	let {
		entry,
		repo,
		number,
		onclose
	}: {
		entry: PeekEntry;
		repo: string;
		number: number;
		onclose: () => void;
	} = $props();

	let text = $state(untrack(() => entry.body ?? ''));
	let saving = $state(false);
	let error = $state('');
	const uploads = new Uploads(getAttachTarget());
	const canSave = $derived(
		!!text.trim() &&
			text.trim() !== entry.body?.trim() &&
			text.length <= MAX_COMMENT_LENGTH &&
			!saving &&
			!uploads.pending
	);
	function cancelOnEscape(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		event.stopPropagation();
		if (!saving && !uploads.pending) onclose();
	}

	async function save() {
		if (!canSave) return;
		const queryKey = keys.peek(repo, number);
		saving = true;
		error = '';
		try {
			const updated = await api.editComment(entry.id, text);
			await queryClient.cancelQueries({ queryKey });
			queryClient.setQueryData<PeekDTO>(queryKey, (old) =>
				old
					? {
							...old,
							timeline: {
								...old.timeline,
								items: old.timeline.items.map((item) =>
									item.id === updated.id ? { ...item, ...updated } : item
								)
							}
						}
					: old
			);
			refetchUnlessLive(keys.dashAll);
			onclose();
		} catch (err) {
			error = (err as Error).message;
		} finally {
			saving = false;
		}
	}
</script>

<div class="ml-7 grid min-w-0 gap-2" role="group" aria-label="Comment editor">
	<textarea
		bind:value={text}
		rows="5"
		aria-label="Edit the comment"
		aria-invalid={!!error}
		maxlength={MAX_COMMENT_LENGTH}
		disabled={saving}
		class={cn(
			'w-full resize-y rounded-md border bg-background px-2 py-1.5 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50',
			DROP_TARGET_CLASS
		)}
		{@attach uploads.textarea}
		{@attach markdownEditor}
		{@attach (node) => {
			node.focus();
		}}
		onkeydown={(event) => {
			cancelOnEscape(event);
			if (commandFor(event, ['editor']) === 'editor.send') {
				event.preventDefault();
				event.stopPropagation();
				void save();
			}
		}}></textarea>
	{#if error}<p role="alert" class="text-sm text-destructive">{error}</p>{/if}
	<div class="flex flex-wrap items-center justify-end gap-2">
		<span class="mr-auto text-xs text-muted-foreground"
			>{keysOf('editor.send')[0] ?? ''} to save</span
		>
		<Button
			size="sm"
			variant="ghost"
			disabled={saving || !!uploads.pending}
			onclick={onclose}
			onkeydown={cancelOnEscape}>Cancel</Button
		>
		<Button size="sm" disabled={!canSave} onclick={() => void save()} onkeydown={cancelOnEscape}>
			{#if saving}<LoaderCircle class="animate-spin" />{/if}
			{saving ? 'Saving…' : 'Save'}
		</Button>
	</div>
</div>
