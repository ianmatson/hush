<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { meQuery } from '$lib/queries';
	import { dismissNote, dismissedNotes } from '$lib/dismissed-notes.svelte';
	import * as Alert from '$lib/components/ui/alert';

	const JEV_NOTICE = 'jev-on-by-default';
	const me = createQuery(meQuery);
</script>

{#if me.data?.settings.smartDecisions && !dismissedNotes.keys.includes(JEV_NOTICE)}
	<Alert.Root class="mb-3">
		<Alert.Title>Hush sorts your work with Jev</Alert.Title>
		<Alert.Description>
			Jev, a decision model from TypeSafe (through Cloudflare), reads the title, labels, start of
			the description, and 2 newest comments of your pull requests and issues. It puts each into a
			category and tags, and tells which comments need you. It keeps nothing.
			<span class="mt-1 flex flex-wrap gap-x-3">
				<a class="underline underline-offset-2" href="/settings/inbox#smart-decisions"
					>Turn it off</a
				>
				<a class="underline underline-offset-2" href="/settings/categories"
					>Change categories and tags</a
				>
				<button
					type="button"
					class="underline underline-offset-2 hover:text-foreground"
					onclick={() => dismissNote(JEV_NOTICE)}>Got it</button
				>
			</span>
		</Alert.Description>
	</Alert.Root>
{/if}
