<script lang="ts">
	import { EXTERNAL_CONTRIBUTOR_TEXT, type ExternalContributor } from '$lib/shared/contributors';
	import { cn } from '$lib/utils';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import UserRoundPlus from '@lucide/svelte/icons/user-round-plus';
	import Sprout from '@lucide/svelte/icons/sprout';

	let { contributor, class: className }: { contributor: ExternalContributor; class?: string } =
		$props();

	const text = $derived(EXTERNAL_CONTRIBUTOR_TEXT[contributor]);
	const Icon = $derived(contributor === 'first-time' ? Sprout : UserRoundPlus);
</script>

<Tooltip.Root>
	<Tooltip.Trigger
		class={cn(
			'flex shrink-0 items-center gap-1 rounded-md bg-signal-reply/12 px-1.5 py-0.5 font-medium text-signal-reply',
			className
		)}
		aria-label={text.description}
	>
		<Icon class="size-3" />{text.label}
	</Tooltip.Trigger>
	<Tooltip.Content>{text.description}</Tooltip.Content>
</Tooltip.Root>
