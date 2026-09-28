<script lang="ts">
	import SettingsJson from '$lib/components/app/settings/settings-json.svelte';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
</script>

<svelte:head><title>settings.json · Settings · Hush</title></svelte:head>

<!-- Not in the settings nav: open it from Advanced, Account (Settings file), or the palette. -->
<div class="grid gap-6">
	<div class="grid gap-1">
		<a
			href="/settings/advanced"
			class="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
			><ArrowLeft class="size-3.5" />Advanced</a
		>
		<h1 class="text-lg font-semibold tracking-tight">settings.json</h1>
	</div>
	<SettingsJson />
</div>
