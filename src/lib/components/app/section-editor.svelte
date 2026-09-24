<script lang="ts">
	import type { DashKind, DashSection } from '$lib/shared/types';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import Trash from '@lucide/svelte/icons/trash';
	import Plus from '@lucide/svelte/icons/plus';
	import ExternalLink from '@lucide/svelte/icons/external-link';

	let {
		kind,
		sections = $bindable(),
		scope,
		previewTeam
	}: {
		kind: DashKind;
		sections: DashSection[];
		scope: string;
		previewTeam: string | null;
	} = $props();

	function move(i: number, d: number) {
		const next = [...sections];
		[next[i], next[i + d]] = [next[i + d], next[i]];
		sections = next;
	}

	function add() {
		const id = `custom-${Math.random().toString(36).slice(2, 8)}`;
		const query = kind === 'pr' ? 'is:pr is:open ' : 'is:issue is:open ';
		sections = [...sections, { id, name: 'New section', query, enabled: true }];
	}

	/** Open the same search on GitHub, to check a query. */
	function preview(s: DashSection) {
		let q = [s.query, scope].filter(Boolean).join(' ');
		if (q.includes('@team')) q = q.replaceAll('@team', previewTeam ?? '');
		return `https://github.com/search?type=${kind === 'pr' ? 'pullrequests' : 'issues'}&q=${encodeURIComponent(q)}`;
	}
</script>

<ul class="grid gap-2">
	{#each sections as s, i (s.id)}
		<!-- Phones: toggle, name, and buttons on one line; the query on its own line below. -->
		<li
			class="flex flex-wrap items-center gap-2 rounded-lg border p-2.5 sm:grid sm:grid-cols-[auto_12rem_1fr_auto]"
		>
			<Switch bind:checked={s.enabled} aria-label="Show {s.name}" />
			<Input
				bind:value={s.name}
				aria-label="Section name"
				class="h-8 min-w-0 flex-1 sm:flex-none"
			/>
			<Input
				bind:value={s.query}
				aria-label="GitHub search query"
				class="order-last h-8 w-full font-mono text-xs sm:order-none sm:w-auto"
				spellcheck={false}
			/>
			<div class="flex shrink-0 items-center justify-end gap-0.5">
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon-xs"
								href={preview(s)}
								target="_blank"
								rel="noreferrer"
								aria-label="Try on GitHub"><ExternalLink /></Button
							>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>Try this search on GitHub</Tooltip.Content>
				</Tooltip.Root>
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label="Move up"
					disabled={i === 0}
					onclick={() => move(i, -1)}><ArrowUp /></Button
				>
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label="Move down"
					disabled={i === sections.length - 1}
					onclick={() => move(i, 1)}><ArrowDown /></Button
				>
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label="Delete section"
					onclick={() => (sections = sections.filter((x) => x.id !== s.id))}><Trash /></Button
				>
			</div>
		</li>
	{/each}
</ul>
<div>
	<Button variant="outline" size="sm" onclick={add} disabled={sections.length >= 20}
		><Plus /> Add section</Button
	>
</div>
