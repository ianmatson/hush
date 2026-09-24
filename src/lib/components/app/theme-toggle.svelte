<script lang="ts">
	import { setMode, userPrefersMode } from 'mode-watcher';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import Monitor from '@lucide/svelte/icons/monitor';
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="icon-sm" aria-label="Theme">
				<Sun class="scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
				<Moon class="absolute scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<DropdownMenu.RadioGroup
			value={userPrefersMode.current}
			onValueChange={(v) => setMode(v as 'light' | 'dark' | 'system')}
		>
			<DropdownMenu.RadioItem value="light"><Sun /> Light</DropdownMenu.RadioItem>
			<DropdownMenu.RadioItem value="dark"><Moon /> Dark</DropdownMenu.RadioItem>
			<DropdownMenu.RadioItem value="system"><Monitor /> System</DropdownMenu.RadioItem>
		</DropdownMenu.RadioGroup>
	</DropdownMenu.Content>
</DropdownMenu.Root>
