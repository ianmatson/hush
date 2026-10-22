<script lang="ts">
	import { cn } from '$lib/utils';
	import { Skeleton } from '$lib/components/ui/skeleton';

	const LINE_HEIGHTS = { sm: 'h-5', xs: 'h-4' };
	const BAR_HEIGHTS = { sm: 'h-3.5', xs: 'h-3' };

	let { line = 'sm', class: className }: { line?: keyof typeof LINE_HEIGHTS; class?: string } =
		$props();
</script>

<span class={cn('flex items-center', LINE_HEIGHTS[line])}>
	<Skeleton class={cn(BAR_HEIGHTS[line], className)} />
</span>
