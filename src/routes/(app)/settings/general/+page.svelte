<script lang="ts">
	import AppearanceSettings from '$lib/components/app/settings/appearance-settings.svelte';
	import MenuSettings from '$lib/components/app/settings/menu-settings.svelte';
	import SwipeSettings from '$lib/components/app/settings/swipe-settings.svelte';
	import SettingsFile from '$lib/components/app/settings/settings-file.svelte';
	import AccountSettings from '$lib/components/app/settings/account-settings.svelte';
</script>

<svelte:head><title>General · Settings · Hush</title></svelte:head>

<div class="grid gap-10">
	<h1 class="text-lg font-semibold tracking-tight">General</h1>
	<AppearanceSettings />
	<MenuSettings />
	<SwipeSettings />
	<AccountSettings />
	<SettingsFile />
</div>
