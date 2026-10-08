<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { commandFor, keysOf } from '$lib/keys.svelte';
	import { sanitize } from '$lib/html';
	import { ago } from '$lib/time';
	import { cn } from '$lib/utils';
	import type { ReviewThread } from '$lib/shared/diff';
	import { Button } from '$lib/components/ui/button';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';

	let {
		thread,
		onchanged
	}: {
		thread: ReviewThread;
		onchanged: () => Promise<unknown>;
	} = $props();

	let open = $state(untrack(() => !thread.resolved));
	let reply = $state('');
	let sending = $state<'reply' | 'resolve' | null>(null);

	const hiddenComments = $derived(thread.totalComments - thread.comments.length);
	const firstAuthor = $derived(thread.comments[0]?.author.login ?? 'someone');

	async function run(kind: 'reply' | 'resolve', action: () => Promise<unknown>) {
		if (sending) return;
		sending = kind;
		try {
			await action();
			await onchanged();
			if (kind === 'reply') reply = '';
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			sending = null;
		}
	}

	const sendReply = () =>
		reply.trim() && run('reply', () => api.replyToThread(thread.id, reply.trim()));
	const toggleResolved = () =>
		run('resolve', () => api.setThreadResolved(thread.id, !thread.resolved));
</script>

<div
	class={cn(
		'my-2 grid gap-2 rounded-lg border bg-background p-3 font-sans text-sm whitespace-normal',
		thread.resolved && 'bg-muted/30'
	)}
>
	<button
		type="button"
		class="flex items-center gap-2 text-left text-xs text-muted-foreground"
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		<ChevronRight class={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')} />
		<span class="truncate"
			>{firstAuthor}
			· {thread.totalComments}
			{thread.totalComments === 1 ? 'comment' : 'comments'}</span
		>
		{#if thread.outdated}<span class="rounded-full border px-1.5 py-px">Outdated</span>{/if}
		{#if thread.fileLevel}<span class="rounded-full border px-1.5 py-px">On the file</span>{/if}
		{#if thread.resolved}<span class="rounded-full border px-1.5 py-px text-signal-merge"
				>Resolved</span
			>{/if}
	</button>

	{#if open}
		{#each thread.comments as comment (comment.id)}
			<div class="grid gap-1">
				<div class="flex items-center gap-2 text-xs">
					{#if comment.author.avatar}
						<img src={comment.author.avatar} alt="" class="size-5 rounded-full bg-muted" />
					{/if}
					<span class="font-medium">{comment.author.login}</span>
					<a
						href={comment.url}
						target="_blank"
						rel="noreferrer"
						class="text-muted-foreground tabular-nums hover:text-foreground">{ago(comment.at)}</a
					>
				</div>
				<div class="gh-html ml-7">{@html sanitize(comment.html)}</div>
			</div>
		{/each}
		{#if hiddenComments > 0}
			<a
				href={thread.comments.at(-1)?.url}
				target="_blank"
				rel="noreferrer"
				class="ml-7 text-xs text-muted-foreground hover:text-foreground"
				>{hiddenComments} more on GitHub</a
			>
		{/if}

		{#if thread.canReply || thread.canResolve || thread.canUnresolve}
			<div class="grid gap-2 border-t pt-2">
				{#if thread.canReply}
					<textarea
						bind:value={reply}
						rows="2"
						placeholder="Reply…"
						aria-label="Reply to the thread"
						class="min-h-9 w-full resize-y rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
						onkeydown={(e) => {
							if (commandFor(e, ['editor']) === 'editor.send') {
								e.preventDefault();
								void sendReply();
							}
						}}></textarea>
				{/if}
				<div class="flex items-center gap-2">
					{#if thread.canReply}
						<span class="text-xs text-muted-foreground"
							>{keysOf('editor.send')[0] ?? ''} to send</span
						>
					{/if}
					<span class="ml-auto flex gap-2">
						{#if thread.resolved ? thread.canUnresolve : thread.canResolve}
							<Button
								size="sm"
								variant="outline"
								disabled={!!sending}
								onclick={() => void toggleResolved()}
							>
								{#if sending === 'resolve'}<LoaderCircle class="animate-spin" />{/if}
								{thread.resolved ? 'Unresolve' : 'Resolve'}
							</Button>
						{/if}
						{#if thread.canReply}
							<Button
								size="sm"
								disabled={!reply.trim() || !!sending}
								onclick={() => void sendReply()}
							>
								{#if sending === 'reply'}<LoaderCircle class="animate-spin" />{/if}
								Reply
							</Button>
						{/if}
					</span>
				</div>
			</div>
		{/if}
	{/if}
</div>
