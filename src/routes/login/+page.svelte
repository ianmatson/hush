<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';
	import { clearCache, keys, queryClient } from '$lib/queries';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import ThemeToggle from '$lib/components/app/theme-toggle.svelte';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import ExternalLink from '@lucide/svelte/icons/external-link';

	const createUrl =
		'https://github.com/settings/tokens/new?scopes=notifications,repo,read:org&description=Hush%20notifications';

	let token = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = null;
		busy = true;
		try {
			await api.login(token.trim());
			// A new account must never see the old account's cached data.
			clearCache();
			await queryClient.fetchQuery({ queryKey: keys.me, queryFn: api.me });
			await goto('/', { replaceState: true });
		} catch (err) {
			error = (err as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<div class="absolute top-3 right-3"><ThemeToggle /></div>

<main class="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12">
	<div class="mb-8 flex items-center gap-3">
		<img src="/icon.svg" alt="" class="size-10 rounded-xl" />
		<div>
			<h1 class="text-xl font-semibold tracking-tight">hush</h1>
			<p class="text-sm text-muted-foreground">
				GitHub notifications, only the ones that need you.
			</p>
		</div>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Sign in with a GitHub token</Card.Title>
			<Card.Description>
				Hush reads your notifications with a GitHub token. The server encrypts the token and never
				shows it again.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form class="grid gap-4" onsubmit={submit}>
				<div class="grid gap-2">
					<Label for="token">GitHub token</Label>
					<Input
						id="token"
						type="password"
						autocomplete="off"
						spellcheck={false}
						placeholder="ghp_… or gho_…"
						bind:value={token}
						required
					/>
					<p class="text-xs text-muted-foreground">
						A classic token needs <code>notifications</code>, <code>repo</code>, and
						<code>read:org</code>. Fine-grained tokens cannot read notifications.
					</p>
					<details class="text-xs text-muted-foreground">
						<summary class="cursor-pointer select-none">My org blocks classic tokens</summary>
						<p class="mt-1.5 leading-relaxed">
							Some orgs allow only OAuth apps. If you use the GitHub CLI and your org approved it,
							run
							<code>gh auth token</code> and paste the result here (it starts with
							<code>gho_</code>). Hush stores it encrypted. To revoke it later, run
							<code>gh auth logout</code> and log in again.
						</p>
					</details>
				</div>
				{#if error}
					<Alert.Root variant="destructive">
						<Alert.Description>{error}</Alert.Description>
					</Alert.Root>
				{/if}
				<div class="flex items-center justify-between gap-2">
					<Button variant="link" class="px-0" href={createUrl} target="_blank" rel="noreferrer">
						Create a token <ExternalLink />
					</Button>
					<Button type="submit" disabled={busy || token.trim().length < 20}>
						{#if busy}<LoaderCircle class="animate-spin" />{/if}
						Sign in
					</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
	<p class="mt-4 text-center text-xs text-muted-foreground">
		If your org uses SAML SSO, authorize the token for that org on GitHub.
	</p>
</main>
