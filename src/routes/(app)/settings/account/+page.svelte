<script lang="ts">
	import AppearanceSettings from '$lib/components/app/settings/appearance-settings.svelte';
	import AccountSettings from '$lib/components/app/settings/account-settings.svelte';
	import SettingsFile from '$lib/components/app/settings/settings-file.svelte';
</script>

<svelte:head><title>Account · Settings · Hush</title></svelte:head>

<div class="grid gap-10">
	<h1 class="text-lg font-semibold tracking-tight">Account</h1>
	<AccountSettings />
	<AppearanceSettings />
	<SettingsFile />
</div>
