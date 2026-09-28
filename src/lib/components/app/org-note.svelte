<script lang="ts">
	import { fly } from 'svelte/transition';
	import { orgNote, setOrgNoteOff } from '$lib/org-note.svelte';
	import { Button } from '$lib/components/ui/button';
	import X from '@lucide/svelte/icons/x';

	/** After sign-in: the orgs Hush can see, so you notice one that is missing. */
	const access = $derived(orgNote.access?.available ? orgNote.access : null);
	const list = $derived(access?.orgs.join(', ') ?? '');
</script>

{#if orgNote.open && access}
	<div class="mx-auto max-w-4xl px-4 pt-3" role="status" transition:fly={{ y: -6, duration: 160 }}>
		<div class="flex items-start gap-3 rounded-lg border bg-muted/40 px-3.5 py-2.5 text-sm">
			<div class="grid min-w-0 flex-1 gap-1">
				<p>
					{#if access.orgs.length}
						Hush can see {access.orgs.length === 1 ? '1 org' : `${access.orgs.length} orgs`}:
						<span class="font-medium">{list}</span>.
					{:else}
						Hush can see no orgs, only your own repositories.
					{/if}
					<span class="text-muted-foreground"
						>Missing one? Its owners may not have approved Hush yet.</span
					>
				</p>
				<p class="flex flex-wrap gap-x-3 gap-y-1 text-xs">
					<a
						class="underline underline-offset-2"
						href={access.approveUrl}
						target="_blank"
						rel="noreferrer">Request approval</a
					>
					<a
						class="underline underline-offset-2"
						href="/settings/account#token"
						onclick={() => (orgNote.open = false)}>Use a custom token</a
					>
					<button
						type="button"
						class="text-muted-foreground underline underline-offset-2 hover:text-foreground"
						onclick={() => setOrgNoteOff(true)}>Don't show again</button
					>
				</p>
			</div>
			<Button
				variant="ghost"
				size="icon-xs"
				aria-label="Close"
				onclick={() => (orgNote.open = false)}><X /></Button
			>
		</div>
	</div>
{/if}
