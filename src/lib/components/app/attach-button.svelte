<script lang="ts">
	import type { Uploads } from '$lib/attachments.svelte';
	import { ATTACHMENT_ACCEPT } from '$lib/shared/attachments';
	import { Button } from '$lib/components/ui/button';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Tip from './tip.svelte';

	let { uploads, box }: { uploads: Uploads; box: HTMLTextAreaElement | null } = $props();

	let picker = $state<HTMLInputElement | null>(null);

	function attachPicked() {
		if (box && picker?.files) uploads.add(box, [...picker.files]);
		if (picker) picker.value = '';
		box?.focus();
	}
</script>

{#if uploads.allowed}
	<input
		bind:this={picker}
		type="file"
		multiple
		accept={ATTACHMENT_ACCEPT}
		class="hidden"
		tabindex="-1"
		onchange={attachPicked}
	/>
	<Tip text="Attach images or videos (or paste or drop them)">
		{#snippet children(props)}
			<Button
				{...props}
				type="button"
				size="icon-sm"
				variant="ghost"
				class="text-muted-foreground"
				aria-label="Attach images or videos"
				onclick={() => picker?.click()}
			>
				{#if uploads.pending}<LoaderCircle class="animate-spin" />{:else}<Paperclip />{/if}
			</Button>
		{/snippet}
	</Tip>
{/if}
