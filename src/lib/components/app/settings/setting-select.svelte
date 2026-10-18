<script lang="ts" generics="T extends string">
	import * as Select from '$lib/components/ui/select';

	let {
		value,
		options,
		onchange,
		label,
		class: className
	}: {
		value: T;
		options: readonly { id: T; label: string }[];
		onchange: (id: T) => void;
		label: string;
		class?: string;
	} = $props();

	const shown = $derived(options.find((o) => o.id === value)?.label ?? value);
</script>

<Select.Root type="single" {value} onValueChange={(id) => onchange(id as T)}>
	<Select.Trigger class={className} aria-label={label}>{shown}</Select.Trigger>
	<Select.Content>
		{#each options as o (o.id)}
			<Select.Item value={o.id} label={o.label} />
		{/each}
	</Select.Content>
</Select.Root>
