<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import { Switch } from '$lib/components/ui/switch';

	type Props = Omit<ComponentProps<typeof Switch>, 'checked' | 'onCheckedChange'> & {
		checked: boolean;
		onsave: (on: boolean) => Promise<boolean>;
	};

	let { checked, onsave, ...rest }: Props = $props();

	let shown = $derived(checked);

	async function change(on: boolean) {
		shown = on;
		if (!(await onsave(on))) shown = checked;
	}
</script>

<Switch {...rest} bind:checked={shown} onCheckedChange={change} />
