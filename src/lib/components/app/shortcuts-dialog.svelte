<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Kbd } from '$lib/components/ui/kbd';
	import type { Shortcut } from '$lib/shortcuts';

	/** The "?" dialog: a page's keyboard shortcuts. */
	let { open = $bindable(false), shortcuts }: { open?: boolean; shortcuts: Shortcut[] } = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Keyboard shortcuts</Dialog.Title>
		</Dialog.Header>
		<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
			{#each shortcuts as [k, d] (k)}
				<dt><Kbd>{k}</Kbd></dt>
				<dd class="text-muted-foreground">{d}</dd>
			{/each}
		</dl>
	</Dialog.Content>
</Dialog.Root>
