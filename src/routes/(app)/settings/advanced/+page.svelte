<script lang="ts">
	import RulesSettings from '$lib/components/app/settings/rules-settings.svelte';
	import SearchesSettings from '$lib/components/app/settings/searches-settings.svelte';
	import MenuSettings from '$lib/components/app/settings/menu-settings.svelte';
	import FeedsSettings from '$lib/components/app/settings/feeds-settings.svelte';
	import { Button } from '$lib/components/ui/button';
	import Braces from '@lucide/svelte/icons/braces';
	import Keyboard from '@lucide/svelte/icons/keyboard';
</script>

<svelte:head><title>Advanced · Settings · Hush</title></svelte:head>

<div class="grid gap-8">
	<div class="flex flex-wrap items-start gap-3">
		<div class="min-w-0 flex-1">
			<h1 class="text-lg font-semibold tracking-tight">Advanced</h1>
			<p class="text-sm text-muted-foreground">
				Rules, where Hush looks, the item menu, and feeds. Every setting is also in settings.json.
			</p>
		</div>
		<div class="flex gap-1">
			<Button variant="ghost" size="sm" href="/settings/keys"><Keyboard />Keybinds</Button>
			<Button variant="ghost" size="sm" href="/settings/json"><Braces />settings.json</Button>
		</div>
	</div>
	<RulesSettings />
	<SearchesSettings />
	<div id="menu" class="scroll-mt-20"><MenuSettings /></div>
	<FeedsSettings />
</div>
