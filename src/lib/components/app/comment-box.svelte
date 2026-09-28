<script lang="ts">
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { commandFor, keysOf } from '$lib/keys.svelte';
	import {
		acting,
		approveLater,
		composer,
		sendAction,
		type ComposeIntent
	} from '$lib/gh-act.svelte';
	import { GH_ACTIONS, ghActions } from '$lib/shared/actions';
	import type { PeekDTO } from '$lib/shared/types';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';

	/**
	 * The comment box at the end of the conversation, as on GitHub. On a PR you can review, the
	 * text can also go with an approval or a change request. The bar and the keys focus it
	 * (focusComposer); ⌘ Enter does what you came for.
	 */
	let { p }: { p: PeekDTO } = $props();

	const states = $derived(ghActions(p));
	const can = (id: 'approve' | 'request_changes') => {
		const s = states.find((x) => x.id === id);
		return !!s && !s.blocked;
	};
	const review = $derived(can('approve') || can('request_changes'));

	let text = $state('');
	let box = $state<HTMLTextAreaElement | null>(null);
	let wrap = $state<HTMLElement | null>(null);

	// Focus it when the bar, a key, or the palette asks.
	let seen = composer.focus;
	$effect(() => {
		const n = composer.focus;
		if (n === seen) return;
		seen = n;
		tick().then(() => {
			wrap?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
			box?.focus({ preventScroll: true });
		});
	});

	async function submit(intent: ComposeIntent) {
		const body = text.trim();
		if (intent !== 'approve' && !body) return void box?.focus();
		if (intent === 'approve') approveLater(p, body || undefined);
		else if (!(await sendAction(p, intent, { body }))) return;
		else toast.success(GH_ACTIONS[intent].done, { description: `${p.repo}#${p.number}` });
		text = '';
		composer.intent = 'comment';
	}

	const placeholder = $derived(
		composer.intent === 'request_changes'
			? 'What should change?'
			: composer.intent === 'approve'
				? 'Leave a comment with your approval (optional)'
				: 'Leave a comment'
	);
</script>

{#if p.can.comment}
	<form
		bind:this={wrap}
		class="grid gap-2 border-t pt-4"
		onsubmit={(e) => {
			e.preventDefault();
			submit(composer.intent);
		}}
	>
		<Textarea
			bind:ref={box}
			bind:value={text}
			class="min-h-20 text-sm"
			{placeholder}
			aria-label="Comment"
			onkeydown={(e) => {
				if (commandFor(e, ['editor']) === 'editor.send') {
					e.preventDefault();
					submit(composer.intent);
				} else if (e.key === 'Escape') {
					e.preventDefault();
					box?.blur();
				}
			}}
		/>
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-xs text-muted-foreground"
				>Markdown · {keysOf('editor.send')[0] ?? ''} to send</span
			>
			<span class="flex-1"></span>
			{#if review && can('request_changes')}
				<Button
					type="button"
					size="sm"
					variant={composer.intent === 'request_changes' ? 'destructive' : 'ghost'}
					disabled={!!acting.id || !text.trim()}
					onclick={() => submit('request_changes')}>Request changes</Button
				>
			{/if}
			{#if review && can('approve')}
				<Button
					type="button"
					size="sm"
					variant={composer.intent === 'approve' ? 'default' : 'outline'}
					disabled={!!acting.id}
					onclick={() => submit('approve')}>Approve</Button
				>
			{/if}
			<Button
				type="button"
				size="sm"
				variant={composer.intent === 'comment' ? 'default' : 'outline'}
				disabled={!!acting.id || !text.trim()}
				onclick={() => submit('comment')}
			>
				{#if acting.id === 'comment'}<LoaderCircle class="animate-spin" />{/if}Comment
			</Button>
		</div>
	</form>
{/if}
