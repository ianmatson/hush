<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { meQuery } from '$lib/queries';
	import { applySettings } from '$lib/save-settings';
	import { settingsFile, settingsFromFile } from '$lib/shared/settings-schema';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import Braces from '@lucide/svelte/icons/braces';

	/** Your settings as a file (only your changes, the same JSON as settings.json). */
	const me = createQuery(meQuery);
	const settings = $derived(me.data?.settings);

	function exportSettings() {
		if (!settings) return;
		const blob = new Blob([JSON.stringify(settingsFile(settings), null, '\t')], {
			type: 'application/json'
		});
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `hush-settings-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	let fileInput = $state<HTMLInputElement | null>(null);
	async function importSettings(file: File | undefined) {
		if (!file) return;
		const patch = settingsFromFile(await file.text());
		if (fileInput) fileInput.value = '';
		if (typeof patch === 'string') return toast.error(patch);
		const n = (list: unknown[] | undefined, one: string) =>
			list ? `${list.length} ${one}${list.length === 1 ? '' : 's'}` : null;
		const what = [n(patch.categoryGroups, 'category group'), n(patch.views, 'view')]
			.filter(Boolean)
			.join(', ');
		if (
			!confirm(
				`Replace your settings with the ones in “${file.name}”?${what ? ` It has ${what}.` : ''} Settings that are not in the file go back to their defaults. Export first to keep a copy.`
			)
		)
			return;
		try {
			const note = await applySettings(patch, true);
			toast.success(`Settings imported.${note}`);
		} catch (err) {
			toast.error((err as Error).message);
		}
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Settings file</Card.Title>
		<Card.Description
			>Keep a copy, move to another account, or share your setup. Appearance and your start page
			stay in this browser.</Card.Description
		>
	</Card.Header>
	<Card.Content class="flex flex-wrap items-center gap-2">
		<Button variant="outline" size="sm" onclick={exportSettings}>Export</Button>
		<Button variant="outline" size="sm" onclick={() => fileInput?.click()}>Import…</Button>
		<input
			bind:this={fileInput}
			type="file"
			accept="application/json,.json"
			class="hidden"
			onchange={(e) => importSettings(e.currentTarget.files?.[0])}
		/>
		<Button variant="ghost" size="sm" href="/settings/json" class="ml-auto"
			><Braces />Edit settings.json</Button
		>
	</Card.Content>
</Card.Root>
