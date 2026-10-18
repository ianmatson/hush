<script lang="ts">
	import type { SettingsDraftControls } from '$lib/settings-draft.svelte';
	import { Button } from '$lib/components/ui/button';

	let { draft, error }: { draft: SettingsDraftControls; error: string | null } = $props();
</script>

<div
	class="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-xl border bg-background/90 p-3 shadow-sm backdrop-blur"
	class:hidden={!draft.dirty}
>
	{#if error}<p class="mr-auto text-xs text-destructive">{error}</p>{:else}<p
			class="mr-auto text-xs text-muted-foreground"
		>
			You have unsaved changes.
		</p>{/if}
	<Button variant="ghost" size="sm" onclick={draft.discard} disabled={draft.saving}>Discard</Button>
	<Button size="sm" onclick={draft.save} disabled={!!error || draft.saving}>Save</Button>
</div>
