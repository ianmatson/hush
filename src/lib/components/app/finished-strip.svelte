<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { keys, queryClient } from '$lib/queries';
	import type { ItemDTO } from '$lib/shared/types';
	import { Button } from '$lib/components/ui/button';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';

	/**
	 * Items that left Your turn by themselves in the last day, and why ("You approved"). So nothing
	 * disappears without a trace; "Undo" puts one back in Your turn (until it changes).
	 */
	let { items }: { items: ItemDTO[] } = $props();

	async function undo(t: ItemDTO) {
		await api.act([t.key], 'my-turn').catch((e) => toast.error(e.message));
		queryClient.invalidateQueries({ queryKey: keys.itemsAll });
	}
	async function dismiss() {
		await api.finishedSeen().catch(() => {});
		queryClient.invalidateQueries({ queryKey: keys.items('turn') });
	}
</script>

{#if items.length}
	<div class="mb-4 rounded-xl border bg-muted/30 px-3 py-2.5 text-sm">
		<div class="flex items-center gap-2">
			<p class="flex-1 text-xs font-medium text-muted-foreground">
				Hush finished {items.length === 1 ? 'this' : `these ${items.length}`} for you
			</p>
			<Button variant="ghost" size="icon-xs" aria-label="Hide" onclick={dismiss}><X /></Button>
		</div>
		<ul class="mt-1 grid gap-1">
			{#each items as t (t.key)}
				<li class="flex items-center gap-2 text-[0.8rem]">
					<Check class="size-3.5 shrink-0 text-signal-merge" />
					<span class="shrink-0 font-medium">{t.finished?.note}</span>
					<a
						href={t.url}
						target="_blank"
						rel="noreferrer"
						class="min-w-0 truncate text-muted-foreground hover:text-foreground"
						>{t.number ? `${t.repo}#${t.number}` : t.repo} · {t.title}</a
					>
					<Button variant="ghost" size="xs" class="ml-auto shrink-0" onclick={() => undo(t)}
						>Undo</Button
					>
				</li>
			{/each}
		</ul>
	</div>
{/if}
