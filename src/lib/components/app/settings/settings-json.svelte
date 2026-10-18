<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { meQuery } from '$lib/queries';
	import { applySettings } from '$lib/save-settings';
	import { createSettingsDraft } from '$lib/settings-draft.svelte';
	import {
		defaultOf,
		SETTINGS_DOCS,
		SETTINGS_SECTIONS,
		settingsOverrides,
		type SettingsPatch
	} from '$lib/shared/settings-schema';
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
	const LONG_DEFAULT_CHARS = 40;

	let error = $state<string | null>(null);
	const editor = createSettingsDraft<string>({
		saved: () => {
			const settings = me.data?.settings;
			return settings && JSON.stringify(settingsOverrides(settings), null, 2);
		},
		save: saveText
	});

	function parsePatch(text: string): SettingsPatch | string {
		let patch: unknown;
		try {
			patch = JSON.parse(text || '{}');
		} catch (err) {
			return `Not valid JSON: ${(err as Error).message}`;
		}
		if (typeof patch !== 'object' || patch === null || Array.isArray(patch))
			return 'settings.json must be an object: { "key": value }.';
		return patch as SettingsPatch;
	}

	async function saveText(text: string): Promise<boolean> {
		const patch = parsePatch(text);
		if (typeof patch === 'string') {
			error = patch;
			return false;
		}
		try {
			await applySettings(patch, true);
			toast.success('settings.json saved.');
			error = null;
			return true;
		} catch (err) {
			error = (err as Error).message;
			return false;
		}
	}

	function discard() {
		editor.discard();
		error = null;
	}

	function defaultText(key: string): string {
		const value = defaultOf(key);
		const text = JSON.stringify(value);
		return Array.isArray(value) && value.length && text.length > LONG_DEFAULT_CHARS
			? `[${value.length} items]`
			: text;
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
			class="min-h-48 overflow-x-auto font-mono text-xs"
			wrap="off"
			spellcheck={false}
			aria-label="settings.json"
			value={editor.draft ?? ''}
			oninput={(e) => {
				editor.draft = e.currentTarget.value;
				error = null;
			}}
			onkeydown={(e) => {
				if (commandFor(e, ['editor']) === 'editor.save') {
					e.preventDefault();
					if (editor.dirty) editor.save();
				}
			}}
		/>
		{#if error}
			<p class="flex items-start gap-1.5 text-xs text-destructive" role="alert">
				<TriangleAlert class="mt-px size-3.5 shrink-0" />{error}
			</p>
		{/if}
		<div class="flex flex-wrap gap-2">
			<Button size="sm" disabled={!editor.dirty || editor.saving} onclick={editor.save}>Save</Button
			>
			<Button variant="ghost" size="sm" disabled={!editor.dirty || editor.saving} onclick={discard}
				>Cancel</Button
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
								>{d.page ? SETTINGS_SECTIONS[d.page].label : 'JSON only'} · default
								<code>{defaultText(d.key)}</code></span
							>
						</dt>
						<dd class="text-muted-foreground">{d.description}</dd>
					</div>
				{/each}
			</dl>
		</details>
	</Card.Content>
</Card.Root>
