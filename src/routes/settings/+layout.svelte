<script lang="ts">
	import { page } from '$app/state';
	import { cn } from '$lib/utils';
	import Bell from '@lucide/svelte/icons/bell';
	import Inbox from '@lucide/svelte/icons/inbox';
	import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
	import Rss from '@lucide/svelte/icons/rss';
	import Palette from '@lucide/svelte/icons/palette';
	import UserRound from '@lucide/svelte/icons/user-round';

	let { children } = $props();

	const sections = [
		{ href: '/settings/notifications', label: 'Notifications', icon: Bell },
		{ href: '/settings/inbox', label: 'Inbox', icon: Inbox },
		{ href: '/settings/dashboards', label: 'PRs & issues', icon: GitPullRequest },
		{ href: '/settings/feeds', label: 'Feeds', icon: Rss },
		{ href: '/settings/appearance', label: 'Appearance', icon: Palette },
		{ href: '/settings/account', label: 'Account', icon: UserRound }
	];
</script>

<div class="mx-auto flex max-w-4xl flex-col gap-6 px-4 pt-6 pb-24 md:flex-row">
	<nav
		class="-mx-1 flex shrink-0 gap-1 overflow-x-auto px-1 md:w-44 md:flex-col md:overflow-visible"
		aria-label="Settings"
	>
		{#each sections as s (s.href)}
			<a
				href={s.href}
				class={cn(
					'flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground',
					page.url.pathname === s.href && 'bg-muted text-foreground'
				)}
			>
				<s.icon class="size-4" />{s.label}
			</a>
		{/each}
	</nav>
	<main class="min-w-0 flex-1">{@render children()}</main>
</div>
