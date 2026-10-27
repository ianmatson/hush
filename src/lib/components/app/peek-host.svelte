<script lang="ts">
	import { closePeek, peek } from '$lib/peek.svelte';
	import Peek from './peek.svelte';
</script>

<Peek
	target={peek.target}
	onclose={closePeek}
	header={peek.header ?? undefined}
	footer={peek.footer ?? undefined}
/>
