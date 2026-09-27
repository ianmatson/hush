<script lang="ts">
	import { page } from '$app/state';
	import * as Alert from '$lib/components/ui/alert';
	import ThemeToggle from '$lib/components/app/theme-toggle.svelte';

	// The callback sends you back here with ?error= when GitHub or the org check says no.
	const error = $derived(page.url.searchParams.get('error'));
</script>

<div class="absolute top-3 right-3"><ThemeToggle /></div>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-4 py-12">
	<div class="flex items-center gap-3">
		<img src="/icon.svg" alt="" class="size-10 rounded-xl" />
		<div>
			<h1 class="text-xl font-semibold tracking-tight">hush</h1>
			<p class="text-sm text-muted-foreground">
				GitHub notifications, only the ones that need you.
			</p>
		</div>
	</div>

	{#if error}
		<Alert.Root variant="destructive">
			<Alert.Description>{error}</Alert.Description>
		</Alert.Root>
	{/if}

	<!-- A full page load: the Worker sends you on to GitHub. -->
	<a
		href="/api/auth/github"
		data-sveltekit-reload
		class="inline-flex h-11 items-center justify-center gap-2.5 rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-85"
	>
		<svg viewBox="0 0 16 16" class="size-4.5" aria-hidden="true" fill="currentColor"
			><path
				d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
			/></svg
		>
		Sign in with GitHub
	</a>

	<p class="text-xs leading-relaxed text-muted-foreground">
		Hush asks for read access to your notifications, your repositories, and your teams. It stores
		the token encrypted and changes nothing on GitHub except what you choose: Done, Read, and Mute.
		If your org uses SAML SSO, GitHub asks you to authorize Hush for it.
	</p>
</main>
