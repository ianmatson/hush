<script lang="ts" module>
	/** A thread (its id) or a dashboard item ("owner/repo#123") that Hush was wrong about. */
	export interface NotNeededTarget {
		id: string;
		title: string;
		repo: string;
		/** It asks for your review. */
		review: boolean;
		/** It needs you because of a review request to one of your teams. */
		team: boolean;
		/** A bot opened it. */
		bot: boolean;
		/** Where "only this one" puts it: "FYI" (inbox) or "Other" (dashboards). */
		elsewhere: string;
	}
</script>

<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { api, type NotNeededAnswer } from '$lib/api';
	import { keys, meQuery, queryClient, setSettings } from '$lib/queries';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';

	/**
	 * "Doesn't need me": Hush was wrong about a thread. Each answer says what it changes, and fixes
	 * the setting or adds the rule that would have been right; "only this one" moves only this PR
	 * or issue, until it changes. Every answer can be undone.
	 */
	let { target = $bindable(null) }: { target: NotNeededTarget | null } = $props();

	const me = createQuery(meQuery);
	const settings = $derived(me.data?.settings);

	const answers = $derived.by(() => {
		const t = target;
		if (!t || !settings) return [];
		const out: { id: NotNeededAnswer; label: string; effect: string }[] = [];
		if (t.review && settings.reviewResolution === 'strict')
			out.push({
				id: 'others-reviewed',
				label: 'Someone else already reviewed it',
				effect: 'A review by someone else settles a review request (for every PR).'
			});
		if (t.team && settings.teamReviewsAreAction)
			out.push({
				id: 'team',
				label: 'Team review requests don’t need me',
				effect: 'Review requests to your teams are FYI (they stay on the Pull requests tab).'
			});
		if (t.bot && !settings.botsAreFyi)
			out.push({
				id: 'bots',
				label: 'A bot opened it',
				effect: 'PRs, comments, and mentions by bots are FYI.'
			});
		out.push({
			id: 'once',
			label: 'Only this one',
			effect: `Only this ${t.id.includes('#') || t.review ? 'PR or issue' : 'thread'} goes to ${t.elsewhere}, until it changes.`
		});
		return out;
	});

	const refresh = () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: keys.threadsAll }),
			queryClient.invalidateQueries({ queryKey: ['dash'] })
		]);

	let choosing = $state(false);

	async function choose(answer: NotNeededAnswer) {
		const t = target;
		if (!t || choosing) return;
		choosing = true;
		try {
			const r = await api.notNeeded(t.id, answer);
			if (target === t) target = null;
			if (r.settings) setSettings(r.settings);
			await refresh();
			toast.success(answer === 'once' ? 'Moved, until it changes' : 'Hush will sort this way now', {
				description: t.title,
				action: {
					label: 'Undo',
					onClick: async () => {
						try {
							if (r.undo.settings) setSettings((await api.saveSettings(r.undo.settings)).settings);
							if (r.undo.once) await api.undoOnlyThisOne(r.undo.once);
							await refresh();
						} catch (err) {
							toast.error((err as Error).message);
						}
					}
				}
			});
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			choosing = false;
		}
	}
</script>

<Dialog.Root open={!!target} onOpenChange={(o) => !o && (target = null)}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Why doesn’t this need you?</Dialog.Title>
			<Dialog.Description>{target?.title}</Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-1.5">
			{#each answers as a (a.id)}
				<Button
					variant="outline"
					class="h-auto flex-col items-start gap-0.5 py-2 text-left whitespace-normal"
					disabled={choosing}
					onclick={() => choose(a.id)}
				>
					<span class="font-medium">{a.label}</span>
					<span class="text-xs font-normal text-muted-foreground">{a.effect}</span>
				</Button>
			{/each}
		</div>
	</Dialog.Content>
</Dialog.Root>
