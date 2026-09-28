<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { meQuery } from '$lib/queries';
	import { applySettings } from '$lib/save-settings';
	import { DEFAULT_SETTINGS } from '$lib/shared/settings';
	import { SETTINGS_DOCS, settingsOverrides } from '$lib/shared/settings-schema';
	import type { Settings } from '$lib/shared/types';
	import { Button } from '$lib/components/ui/button';
	import { commandFor } from '$lib/keys.svelte';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Card from '$lib/components/ui/card';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { SITE_URL } from '$lib/site';

	/**
	 * settings.json: your changes from the defaults, as JSON, the same as VS Code. The UI shows the
	 * common settings; the rest are only here. (Export and import: settings-file.svelte.)
	 */
	const me = createQuery(meQuery);
	const settings = $derived(me.data?.settings);
	const saved = $derived(settings ? JSON.stringify(settingsOverrides(settings), null, 2) : '');

	let text = $state<string | null>(null);
	let error = $state<string | null>(null);
	let saving = $state(false);
	const value = $derived(text ?? saved);
	const dirty = $derived(text !== null && text !== saved);

	async function save() {
		let patch: Partial<Settings>;
		try {
			patch = JSON.parse(value || '{}');
		} catch (err) {
			error = `Not valid JSON: ${(err as Error).message}`;
			return;
		}
		if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
			error = 'settings.json must be an object: { "key": value }.';
			return;
		}
		saving = true;
		try {
			const note = await applySettings(patch, true);
			toast.success(`settings.json saved.${note}`);
			text = null;
			error = null;
		} catch (err) {
			error = (err as Error).message;
		} finally {
			saving = false;
		}
	}

	const PAGE_LABEL: Record<string, string> = {
		inbox: 'Inbox',
		dashboards: 'PRs & issues',
		notifications: 'Notifications',
		general: 'General',
		keys: 'Keybinds'
	};
	function defaultOf(key: string): string {
		const [top, sub] = key.split('.');
		const d = (DEFAULT_SETTINGS as unknown as Record<string, Record<string, unknown>>)[top];
		const v = sub ? d[sub] : d;
		const s = JSON.stringify(v);
		return Array.isArray(v) && v.length && s.length > 40 ? `[${v.length} items]` : s;
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>settings.json</Card.Title>
		<Card.Description
			>Your changes from the defaults. Every setting is here, also the ones the pages do not show.
			Remove a key to go back to its default. <a
				class="underline underline-offset-2 hover:text-foreground"
				href="{SITE_URL}/docs/settings"
				target="_blank"
				rel="noreferrer">What each setting does</a
			></Card.Description
		>
	</Card.Header>
	<Card.Content class="grid gap-3">
		<Textarea
			class="min-h-48 font-mono text-xs"
			spellcheck={false}
			aria-label="settings.json"
			{value}
			oninput={(e) => {
				text = e.currentTarget.value;
				error = null;
			}}
			onkeydown={(e) => {
				if (commandFor(e, ['editor']) === 'editor.save') {
					e.preventDefault();
					if (dirty) save();
				}
			}}
		/>
		{#if error}
			<p class="flex items-start gap-1.5 text-xs text-destructive" role="alert">
				<TriangleAlert class="mt-px size-3.5 shrink-0" />{error}
			</p>
		{/if}
		<div class="flex flex-wrap gap-2">
			<Button size="sm" disabled={!dirty || saving} onclick={save}>Save</Button>
			<Button
				variant="ghost"
				size="sm"
				disabled={!dirty}
				onclick={() => {
					text = null;
					error = null;
				}}>Cancel</Button
			>
		</div>

		<details class="group rounded-lg border">
			<summary class="cursor-pointer px-3 py-2 text-sm font-medium select-none"
				>All settings</summary
			>
			<dl class="grid divide-y border-t text-xs">
				{#each SETTINGS_DOCS as d (d.key)}
					<div class="grid gap-0.5 px-3 py-2">
						<dt class="flex flex-wrap items-baseline gap-x-2">
							<code class="font-medium">{d.key}</code>
							<span class="text-muted-foreground"
								>{d.page ? PAGE_LABEL[d.page] : 'JSON only'} · default
								<code>{defaultOf(d.key)}</code></span
							>
						</dt>
						<dd class="text-muted-foreground">{d.description}</dd>
					</div>
				{/each}
			</dl>
		</details>
	</Card.Content>
</Card.Root>
