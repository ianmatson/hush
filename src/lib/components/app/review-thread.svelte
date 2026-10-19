<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { progressToast } from '$lib/progress-toast';
	import { api } from '$lib/api';
	import { ArmedConfirm } from '$lib/armed-confirm.svelte';
	import { commandFor, keysOf } from '$lib/keys.svelte';
	import { sanitize } from '$lib/html';
	import { ago } from '$lib/time';
	import { cn } from '$lib/utils';
	import { clearSentDraft, loadDraft, saveDraft } from '$lib/drafts';
	import { splitPath, threadElementId, type ReviewThread } from '$lib/shared/diff';
	import { Button } from '$lib/components/ui/button';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { DROP_TARGET_CLASS, Uploads, getAttachTarget } from '$lib/attachments.svelte';
	import { profileUrl } from '$lib/shared/github-links';
	import GhLink from './gh-link.svelte';
	import Tip from './tip.svelte';
	import DiffExcerpt from './diff-excerpt.svelte';

	let {
		thread,
		onchanged,
		diffHref,
		highlighted = false
	}: {
		thread: ReviewThread;
		onchanged: () => Promise<unknown>;
		diffHref?: string;
		highlighted?: boolean;
	} = $props();

	let open = $state(untrack(() => !thread.resolved || highlighted));
	$effect(() => {
		if (highlighted) open = true;
	});
	const path = $derived(splitPath(thread.path));
	const commentCount = $derived(
		`${thread.totalComments} ${thread.totalComments === 1 ? 'comment' : 'comments'}`
	);
	const replyKey = $derived(`reply:${thread.id}`);
	let reply = $state(untrack(() => loadDraft(replyKey)));
	$effect(() => saveDraft(replyKey, reply));
	let sending = $state<'reply' | 'resolve' | 'edit' | 'delete' | null>(null);
	let editingId = $state<string | null>(null);
	let editText = $state('');
	const deleteConfirm = new ArmedConfirm();
	onDestroy(() => deleteConfirm.dispose());
	const uploads = new Uploads(getAttachTarget());
	const isPending = $derived(thread.comments.some((c) => c.pending));

	const hiddenComments = $derived(thread.totalComments - thread.comments.length);
	const firstAuthor = $derived(thread.comments[0]?.author.login ?? 'someone');

	async function saveEdit(id: string) {
		if (!editText.trim()) return;
		if (await run('edit', () => api.editReviewComment(id, editText.trim()))) editingId = null;
	}

	async function deleteComment(id: string) {
		if (!deleteConfirm.isArmed(id)) return deleteConfirm.arm(id);
		await run('delete', () => api.editReviewComment(id, null));
		deleteConfirm.disarm();
	}

	type ThreadAction = 'reply' | 'resolve' | 'edit' | 'delete';

	function progressLabels(kind: ThreadAction): { pending: string; done: string } {
		switch (kind) {
			case 'reply':
				return { pending: 'Posting reply…', done: 'Reply posted' };
			case 'resolve':
				return thread.resolved
					? { pending: 'Unresolving…', done: 'Conversation unresolved' }
					: { pending: 'Resolving…', done: 'Conversation resolved' };
			case 'edit':
				return { pending: 'Saving comment…', done: 'Comment saved' };
			case 'delete':
				return { pending: 'Deleting comment…', done: 'Comment deleted' };
		}
	}

	async function run(kind: ThreadAction, action: () => Promise<unknown>): Promise<boolean> {
		if (sending || uploads.pending) return false;
		sending = kind;
		const labels = progressLabels(kind);
		const progress = progressToast(labels.pending);
		try {
			await action();
			await onchanged();
			progress.success(labels.done);
			return true;
		} catch (err) {
			progress.error((err as Error).message);
			return false;
		} finally {
			sending = null;
		}
	}

	async function sendReply() {
		const sent = reply;
		const sentKey = replyKey;
		if (!sent.trim()) return;
		if (!(await run('reply', () => api.replyToThread(thread.id, sent.trim())))) return;
		clearSentDraft(sentKey, sent);
		if (replyKey === sentKey && reply === sent) reply = '';
	}

	function cancelEditOnEscape(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		event.stopPropagation();
		if (!sending && !uploads.pending) editingId = null;
	}
	const toggleResolved = () =>
		run('resolve', () => api.setThreadResolved(thread.id, !thread.resolved));
</script>

{#snippet labels()}
	{#if thread.outdated}<span class="shrink-0 rounded-full border px-1.5 py-px">Outdated</span>{/if}
	{#if thread.fileLevel}<span class="shrink-0 rounded-full border px-1.5 py-px">On the file</span
		>{/if}
	{#if isPending}<span
			class="shrink-0 rounded-full border border-signal-review/50 px-1.5 py-px text-signal-review"
			>Pending</span
		>{/if}
	{#if thread.resolved}<span class="shrink-0 rounded-full border px-1.5 py-px text-signal-merge"
			>Resolved</span
		>{/if}
{/snippet}

<div
	id={diffHref ? undefined : threadElementId(thread.id)}
	class={cn(
		'grid gap-2 rounded-lg border bg-background p-3 font-sans text-sm whitespace-normal',
		!diffHref && 'my-2',
		thread.resolved && 'bg-muted/30',
		highlighted && 'ring-2 ring-signal-review/50'
	)}
>
	{#if diffHref}
		<div class="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
			<button
				type="button"
				class="-m-1 shrink-0 rounded-md p-1 hover:bg-muted hover:text-foreground"
				aria-expanded={open}
				aria-label="Thread"
				onclick={() => (open = !open)}
			>
				<ChevronRight class={cn('size-3.5 transition-transform', open && 'rotate-90')} />
			</button>
			<Tip focusable={false} text={thread.path}>
				{#snippet children(props)}
					<a
						{...props}
						href={diffHref}
						class="flex min-w-0 font-mono underline-offset-2 hover:text-foreground hover:underline"
						><span class="min-w-0 truncate">{path.directory}</span><span
							class="max-w-full shrink-0 truncate text-foreground">{path.name}</span
						></a
					>
				{/snippet}
			</Tip>
			{@render labels()}
			{#if !open}<span class="ml-auto shrink-0 tabular-nums">{commentCount}</span>{/if}
		</div>
		{#if open && thread.excerpt.length}
			<DiffExcerpt lines={thread.excerpt} path={thread.path} />
		{/if}
	{:else}
		<button
			type="button"
			class="flex items-center gap-2 text-left text-xs text-muted-foreground"
			aria-expanded={open}
			onclick={() => (open = !open)}
		>
			<ChevronRight class={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')} />
			<span class="truncate">{firstAuthor} · {commentCount}</span>
			{@render labels()}
		</button>
	{/if}

	{#if open}
		{#each thread.comments as comment (comment.id)}
			<div class="grid gap-1">
				<div class="flex items-center gap-2 text-xs">
					<GhLink
						href={profileUrl(comment.author.login)}
						class="flex items-center gap-2 font-medium"
						>{#if comment.author.avatar}<img
								src={comment.author.avatar}
								alt=""
								class="size-5 rounded-full bg-muted"
							/>{/if}{comment.author.login}</GhLink
					>
					<a
						href={comment.url}
						target="_blank"
						rel="noreferrer"
						class="text-muted-foreground tabular-nums hover:text-foreground">{ago(comment.at)}</a
					>
					{#if editingId !== comment.id && (comment.canEdit || comment.canDelete)}
						<span class="ml-auto flex gap-2 text-muted-foreground">
							{#if comment.canEdit}
								<button
									type="button"
									class="hover:text-foreground"
									onclick={() => {
										editingId = comment.id;
										editText = comment.body;
									}}>Edit</button
								>
							{/if}
							{#if comment.canDelete}
								<button
									type="button"
									class={cn(
										'hover:text-foreground',
										deleteConfirm.isArmed(comment.id) && 'text-destructive'
									)}
									disabled={!!sending}
									onclick={() => void deleteComment(comment.id)}
									>{deleteConfirm.isArmed(comment.id) ? 'Confirm: delete' : 'Delete'}</button
								>
							{/if}
						</span>
					{/if}
				</div>
				{#if editingId === comment.id}
					<div class="ml-7 grid gap-2">
						<textarea
							bind:value={editText}
							rows="3"
							aria-label="Edit the comment"
							class={cn(
								'w-full resize-y rounded-md border bg-background px-2 py-1.5 font-mono text-sm outline-none read-only:opacity-50 focus-visible:ring-2 focus-visible:ring-ring/50',
								DROP_TARGET_CLASS
							)}
							readonly={sending === 'edit'}
							{@attach uploads.textarea}
							{@attach (node) => {
								node.focus();
							}}
							onkeydown={(e) => {
								cancelEditOnEscape(e);
								if (commandFor(e, ['editor']) === 'editor.send') {
									e.preventDefault();
									e.stopPropagation();
									void saveEdit(comment.id);
								}
							}}></textarea>
						<span class="flex justify-end gap-2">
							<Button
								size="sm"
								variant="ghost"
								disabled={!!sending || !!uploads.pending}
								onclick={() => (editingId = null)}
								onkeydown={cancelEditOnEscape}>Cancel</Button
							>
							<Button
								size="sm"
								disabled={!editText.trim() || !!sending || !!uploads.pending}
								onclick={() => void saveEdit(comment.id)}
								onkeydown={cancelEditOnEscape}
							>
								{#if sending === 'edit'}<LoaderCircle class="animate-spin" />{/if}
								Save
							</Button>
						</span>
					</div>
				{:else}
					<div class="gh-html ml-7">{@html sanitize(comment.html)}</div>
				{/if}
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
						class={cn(
							'min-h-9 w-full resize-y rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
							DROP_TARGET_CLASS
						)}
						{@attach uploads.textarea}
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
								disabled={!reply.trim() || !!sending || !!uploads.pending}
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
