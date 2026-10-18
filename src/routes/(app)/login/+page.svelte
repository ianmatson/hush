<script lang="ts">
	import { page } from '$app/state';
	import * as Alert from '$lib/components/ui/alert';
	import { GITHUB_MARK } from '$lib/components/site/github-mark';

	// The callback sends you back here with ?error= when GitHub or the org check says no.
	const error = $derived(page.url.searchParams.get('error'));
</script>

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
			><path d={GITHUB_MARK} /></svg
		>
		Sign in with GitHub
	</a>

	<p class="text-xs leading-relaxed text-muted-foreground">
		Hush asks for access to your notifications, your repositories, and your teams. It stores the
		token encrypted, and it acts on GitHub only when you do: a review, a comment, a merge, or Done.
		If your org uses SAML SSO, GitHub asks you to authorize Hush for it.
	</p>
</main>
