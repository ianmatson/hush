<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import SettingSelect from './settings/setting-select.svelte';
	import { MERGE_LABEL } from '$lib/shared/actions';
	import type { MergeMethod, PeekDTO } from '$lib/shared/types';

	let {
		open = $bindable(false),
		method = $bindable(),
		deleteBranch = $bindable(false),
		canDeleteBranch,
		p,
		notice,
		onconfirm
	}: {
		open?: boolean;
		method: MergeMethod;
		deleteBranch?: boolean;
		canDeleteBranch: boolean;
		p: PeekDTO;
		notice: string | null;
		onconfirm: () => void;
	} = $props();

	const methods = $derived(p.can.pr?.methods ?? []);
	const methodOptions = $derived(methods.map((m) => ({ id: m, label: MERGE_LABEL[m] })));
	let confirmButton = $state<HTMLButtonElement | null>(null);

	function confirm() {
		open = false;
		onconfirm();
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class="sm:max-w-md"
		onOpenAutoFocus={(e) => {
			e.preventDefault();
			confirmButton?.focus();
		}}
	>
		<Dialog.Header>
			<Dialog.Title>Merge this pull request?</Dialog.Title>
			<Dialog.Description class="grid gap-1">
				<span class="text-foreground">{p.title}</span>
				<span class="font-mono text-xs"
					>{p.repo}#{p.number}{#if p.pr}{` · ${p.pr.head} → ${p.pr.base}`}{/if}</span
				>
			</Dialog.Description>
		</Dialog.Header>
		{#if methods.length > 1}
			<div class="flex items-center justify-between gap-3 text-sm">
				<span>Merge method</span>
				<SettingSelect
					value={method}
					options={methodOptions}
					onchange={(m) => (method = m)}
					label="Merge method"
				/>
			</div>
		{/if}
		{#if canDeleteBranch && p.pr}
			<label for="merge-delete-branch" class="flex cursor-pointer items-start gap-2 text-sm">
				<Checkbox id="merge-delete-branch" class="mt-0.5" bind:checked={deleteBranch} />
				<span>Delete <span class="font-mono text-xs">{p.pr.head}</span> after the merge</span>
			</label>
		{/if}
		{#if notice}<p class="text-muted-foreground">{notice}</p>{/if}
		<div class="flex justify-end gap-2">
			<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
			<Button bind:ref={confirmButton} onclick={confirm}>{MERGE_LABEL[method]}</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
