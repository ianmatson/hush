<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { api } from '$lib/api';
	import { leaveTo, meQuery } from '$lib/queries';
	import { saveSettings } from '$lib/save-settings';
	import { settingsFile, settingsFromFile } from '$lib/shared/settings';
	import { toast } from 'svelte-sonner';
	import { ago } from '$lib/time';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';

	const me = createQuery(meQuery);

	async function signOut() {
		await api.logout().catch(() => {});
		leaveTo('/login');
	}

	function exportSettings() {
		const settings = me.data?.settings;
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
		const what = [n(patch.rules, 'rule'), n(patch.views, 'view')].filter(Boolean).join(', ');
		if (
			!confirm(
				`Replace your settings with the ones in “${file.name}”?${what ? ` It has ${what}.` : ''} This cannot be undone. Export first to keep a copy.`
			)
		)
			return;
		await saveSettings(patch, 'Settings imported');
	}

	async function deleteAccount() {
		if (
			!confirm('Delete your Hush account? This removes your token, rules, feeds, and push devices.')
		)
			return;
		await api.deleteAccount();
		leaveTo('/login');
	}
</script>

<svelte:head><title>Account · Settings · Hush</title></svelte:head>

<div class="grid gap-6">
	<div>
		<h1 class="text-lg font-semibold tracking-tight">Account</h1>
	</div>

	{#if me.data}
		<Card.Root>
			<Card.Content class="grid gap-3 text-sm">
				<div class="grid grid-cols-[8rem_1fr] gap-y-1.5">
					<span class="text-muted-foreground">GitHub</span><span>@{me.data.login}</span>
					<span class="text-muted-foreground">Token scopes</span><span class="font-mono text-xs"
						>{me.data.scopes.join(', ') || 'unknown'}</span
					>
					<span class="text-muted-foreground">Last sync</span><span
						>{me.data.lastPollAt ? ago(me.data.lastPollAt) : 'not yet'}</span
					>
				</div>
				{#if me.data.lastPollError}
					<Alert.Root variant="destructive"
						><Alert.Description>{me.data.lastPollError}</Alert.Description></Alert.Root
					>
				{/if}
				<div class="flex flex-wrap gap-2">
					<Button variant="outline" size="sm" onclick={signOut}>Change token</Button>
					<Button variant="outline" size="sm" onclick={signOut}>Sign out</Button>
					<Button variant="destructive" size="sm" onclick={deleteAccount}>Delete account</Button>
				</div>
				<p class="text-xs text-muted-foreground">
					Signing out also clears Hush data cached in this browser.
				</p>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Your settings as a file</Card.Title>
				<Card.Description
					>Rules, views, dashboards, menus, notifications, and quiet hours. Keep a copy, move to
					another account, or share your rules. Appearance and your start page stay in this browser.</Card.Description
				>
			</Card.Header>
			<Card.Content class="flex flex-wrap gap-2">
				<Button variant="outline" size="sm" onclick={exportSettings}>Export</Button>
				<Button variant="outline" size="sm" onclick={() => fileInput?.click()}>Import…</Button>
				<input
					bind:this={fileInput}
					type="file"
					accept="application/json,.json"
					class="hidden"
					onchange={(e) => importSettings(e.currentTarget.files?.[0])}
				/>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
