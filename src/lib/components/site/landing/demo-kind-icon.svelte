<script lang="ts">
	import { cx } from './demo-ui';
	import Eye from '@lucide/svelte/icons/eye';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import FilePenLine from '@lucide/svelte/icons/file-pen-line';
	import GitMerge from '@lucide/svelte/icons/git-merge';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import CircleDot from '@lucide/svelte/icons/circle-dot';
	import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
	import Tag from '@lucide/svelte/icons/tag';
	import MessagesSquare from '@lucide/svelte/icons/messages-square';
	import Workflow from '@lucide/svelte/icons/workflow';
	import type { DemoKind, DemoSubject } from './demo-data';

	let { kind, subject, needsYou }: { kind: DemoKind; subject: DemoSubject; needsYou: boolean } =
		$props();

	const BY_KIND = {
		review: { icon: Eye, tone: 'text-signal-review bg-signal-review/12' },
		fix_ci: { icon: CircleX, tone: 'text-signal-fail bg-signal-fail/12' },
		address_review: { icon: FilePenLine, tone: 'text-signal-warn bg-signal-warn/14' },
		merge: { icon: GitMerge, tone: 'text-signal-merge bg-signal-merge/12' },
		reply: { icon: MessageCircle, tone: 'text-signal-reply bg-signal-reply/12' }
	} as const;

	const BY_SUBJECT = {
		PullRequest: GitPullRequest,
		Issue: CircleDot,
		Release: Tag,
		Discussion: MessagesSquare,
		CheckSuite: Workflow
	} as const;

	const spec = $derived(
		needsYou && kind !== 'none'
			? BY_KIND[kind]
			: { icon: BY_SUBJECT[subject], tone: 'text-muted-foreground bg-muted' }
	);
</script>

<span class={cx('flex size-8 shrink-0 items-center justify-center rounded-full', spec.tone)}>
	<spec.icon class="size-4" />
</span>
