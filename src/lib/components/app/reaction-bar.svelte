<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { queryClient } from '$lib/queries';
	import { REACTIONS, toggled } from '$lib/shared/reactions';
	import type { ReactionContent, Reactions } from '$lib/shared/types';
	import { cn } from '$lib/utils';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import SmilePlus from '@lucide/svelte/icons/smile-plus';

	/**
	 * The reactions under a comment, as on GitHub: a click on one adds yours or takes it back, and
	 * the smile adds another. The row changes at once, and goes back if GitHub refuses.
	 */
	let { r, class: className }: { r: Reactions; class?: string } = $props();

	// The peek's copy until the peek loads again.
	let groups = $derived(r.groups);
	let busy = $state(false);

	const EMOJI = Object.fromEntries(REACTIONS.map((x) => [x.content, x]));

	async function toggle(content: ReactionContent) {
		if (busy || !r.canReact) return;
		const before = groups;
		const add = !before.find((g) => g.content === content)?.mine;
		groups = toggled({ ...r, groups: before }, content);
		busy = true;
		try {
			await api.react(r.id, content, add);
			// The peeks' saved copies are old now: they load again the next time they open.
			for (const queryKey of [['peek'], ['peek-thread']])
				queryClient.invalidateQueries({ queryKey, refetchType: 'none' });
		} catch (err) {
			groups = before;
			toast.error(`Reaction: ${(err as Error).message}`);
		} finally {
			busy = false;
		}
	}

	const who = (count: number, mine: boolean) =>
		mine ? (count === 1 ? 'You' : `You and ${count - 1} more`) : `${count}`;
</script>

{#if groups.length || r.canReact}
	<div class={cn('flex flex-wrap items-center gap-1', className)}>
		{#each groups as g (g.content)}
			<button
				type="button"
				disabled={!r.canReact}
				title="{EMOJI[g.content].label}: {who(g.count, g.mine)}"
				aria-pressed={g.mine}
				class={cn(
					'flex h-6 items-center gap-1 rounded-full border px-2 text-xs tabular-nums transition-colors',
					g.mine
						? 'border-primary/40 bg-primary/10 text-foreground'
						: 'border-border text-muted-foreground hover:bg-muted',
					!r.canReact && 'cursor-default'
				)}
				onclick={() => toggle(g.content)}
			>
				<span class="text-[0.8rem] leading-none">{EMOJI[g.content].emoji}</span>{g.count}
			</button>
		{/each}
		{#if r.canReact}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					aria-label="Add a reaction"
				>
					<SmilePlus class="size-3.5" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="start" class="flex w-auto min-w-0 gap-0.5 p-1">
					{#each REACTIONS as x (x.content)}
						{@const mine = groups.some((g) => g.content === x.content && g.mine)}
						<DropdownMenu.Item
							class={cn('size-8 justify-center p-0 text-base', mine && 'bg-primary/10')}
							title={x.label}
							aria-label={x.label}
							onSelect={() => toggle(x.content)}>{x.emoji}</DropdownMenu.Item
						>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}
	</div>
{/if}
