<script lang="ts" module>
	import type { DashKind } from '$lib/shared/types';
	export type Showing = DashKind | 'both';
</script>

<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import Check from '@lucide/svelte/icons/check';
	import CircleDot from '@lucide/svelte/icons/circle-dot';
	import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
	import Layers from '@lucide/svelte/icons/layers';

	let {
		options,
		value,
		count,
		onchange
	}: {
		options: Showing[];
		value: Showing;
		count: (option: Showing) => number;
		onchange: (option: Showing) => void;
	} = $props();

	const CHOICES: Record<Showing, { label: string; icon: typeof Layers }> = {
		both: { label: 'All', icon: Layers },
		pr: { label: 'Pull requests', icon: GitPullRequest },
		issue: { label: 'Issues', icon: CircleDot }
	};
	const ordered = $derived([...options].sort((a, b) => (a === 'both' ? -1 : b === 'both' ? 1 : 0)));
	const current = $derived(CHOICES[value]);
</script>

{#if options.length > 1}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="ghost" size="sm" aria-label="Show: {current.label}">
					<current.icon />{current.label}<span class="tabular-nums opacity-60">{count(value)}</span>
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="start" class="w-48">
			{#each ordered as option (option)}
				{@const choice = CHOICES[option]}
				<DropdownMenu.Item onclick={() => onchange(option)}>
					<choice.icon />
					<span class="flex-1">{choice.label}</span>
					<span class="text-xs text-muted-foreground tabular-nums">{count(option)}</span>
					{#if option === value}<Check class="size-3.5" />{:else}<span class="size-3.5"></span>{/if}
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/if}
