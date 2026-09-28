<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { api, type NotMineAnswer } from '$lib/api';
	import { keys, meQuery, queryClient, setSettings } from '$lib/queries';
	import type { ItemDTO } from '$lib/shared/types';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';

	/**
	 * "Not my turn": Hush was wrong about an item. Each answer says what it changes; the choice
	 * fixes the setting or adds the rule that would have been right, and can be undone.
	 */
	let { item = $bindable(null) }: { item: ItemDTO | null } = $props();

	const me = createQuery(meQuery);
	const settings = $derived(me.data?.settings);

	const answers = $derived.by(() => {
		const t = item;
		if (!t || !settings) return [];
		const out: { id: NotMineAnswer; label: string; effect: string }[] = [];
		if (t.needs === 'review' && settings.reviewResolution === 'strict')
			out.push({
				id: 'others-reviewed',
				label: 'Someone else already reviewed it',
				effect: 'A review by someone else settles a review request (for every item).'
			});
		if (/^Review for /.test(t.reason) && settings.teamReviewsAreMine)
			out.push({
				id: 'team',
				label: 'Team review requests are not mine',
				effect: 'Team review requests wait on the team, in Waiting.'
			});
		if (t.authorIsBot && !settings.botsAreUpdates)
			out.push({
				id: 'bots',
				label: 'It is a bot’s PR',
				effect: 'Bots’ PRs and comments go to Updates.'
			});
		out.push({
			id: 'repo',
			label: `I don’t work on ${t.repo}`,
			effect: `A rule: everything in ${t.repo} goes to Updates.`
		});
		out.push({
			id: 'once',
			label: 'Only this one',
			effect: 'This item goes to Updates until it changes.'
		});
		return out;
	});

	async function choose(answer: NotMineAnswer) {
		const t = item;
		if (!t) return;
		item = null;
		try {
			const r = await api.notMine(t.key, answer);
			if (r.settings) setSettings(r.settings);
			await queryClient.invalidateQueries({ queryKey: keys.itemsAll });
			toast.success(answer === 'once' ? 'Moved to Updates' : 'Hush will sort this way now', {
				description: t.title,
				action: {
					label: 'Undo',
					onClick: async () => {
						if (r.undo.settings) setSettings((await api.saveSettings(r.undo.settings)).settings);
						if (r.undo.restore) await api.act([r.undo.restore], 'restore');
						queryClient.invalidateQueries({ queryKey: keys.itemsAll });
					}
				}
			});
		} catch (err) {
			toast.error((err as Error).message);
		}
	}
</script>

<Dialog.Root open={!!item} onOpenChange={(o) => !o && (item = null)}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Why is this not your turn?</Dialog.Title>
			<Dialog.Description>{item?.title}</Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-1.5">
			{#each answers as a (a.id)}
				<Button
					variant="outline"
					class="h-auto flex-col items-start gap-0.5 py-2 text-left whitespace-normal"
					onclick={() => choose(a.id)}
				>
					<span class="font-medium">{a.label}</span>
					<span class="text-xs font-normal text-muted-foreground">{a.effect}</span>
				</Button>
			{/each}
		</div>
	</Dialog.Content>
</Dialog.Root>
