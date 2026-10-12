<script lang="ts">
	import type { DashKind } from '$lib/shared/types';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import Check from '@lucide/svelte/icons/check';
	import CircleDot from '@lucide/svelte/icons/circle-dot';
	import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
	import Layers from '@lucide/svelte/icons/layers';

	let {
		kinds,
		shown,
		count,
		onchange
	}: {
		kinds: DashKind[];
		shown: DashKind[];
		count: (kind: DashKind) => number;
		onchange: (shown: DashKind[]) => void;
	} = $props();

	const CHOICES: Record<DashKind, { label: string; icon: typeof Layers }> = {
		pr: { label: 'Pull requests', icon: GitPullRequest },
		issue: { label: 'Issues', icon: CircleDot }
	};
	const showsAll = $derived(shown.length === kinds.length);
	const trigger = $derived(showsAll ? { label: 'All', icon: Layers } : CHOICES[shown[0]]);
	const total = $derived(shown.reduce((n, k) => n + count(k), 0));

	function toggle(kind: DashKind) {
		const on = shown.includes(kind);
		if (on && shown.length === 1) return;
		onchange(kinds.filter((k) => (k === kind ? !on : shown.includes(k))));
	}
</script>

{#if kinds.length > 1}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="ghost" size="sm" aria-label="Show: {trigger.label}">
					<trigger.icon /><span class="hidden sm:inline">{trigger.label}</span><span
						class="tabular-nums opacity-60">{total}</span
					>
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="start" class="w-48">
			{#each kinds as kind (kind)}
				{@const choice = CHOICES[kind]}
				{@const on = shown.includes(kind)}
				<DropdownMenu.CheckboxItem
					checked={on}
					closeOnSelect={false}
					disabled={on && shown.length === 1}
					onCheckedChange={() => toggle(kind)}
				>
					<choice.icon />
					<span class="flex-1">{choice.label}</span>
					<span class="text-xs text-muted-foreground tabular-nums">{count(kind)}</span>
				</DropdownMenu.CheckboxItem>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/if}
