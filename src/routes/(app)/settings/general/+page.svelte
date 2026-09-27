<script lang="ts">
	import AppearanceSettings from '$lib/components/app/settings/appearance-settings.svelte';
	import MenuSettings from '$lib/components/app/settings/menu-settings.svelte';
	import SettingsJson from '$lib/components/app/settings/settings-json.svelte';
	import AccountSettings from '$lib/components/app/settings/account-settings.svelte';
</script>

<svelte:head><title>General · Settings · Hush</title></svelte:head>

<div class="grid gap-10">
	<h1 class="text-lg font-semibold tracking-tight">General</h1>
	<AppearanceSettings />
	<MenuSettings />
	<section class="grid gap-6">
		<h2 class="text-base font-semibold tracking-tight">All settings</h2>
		<SettingsJson />
	</section>
	<AccountSettings />
</div>
