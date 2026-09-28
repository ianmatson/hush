<script lang="ts">
	import type { ActionKind, Lane } from '$lib/shared/types';
	import { cn } from '$lib/utils';
	import Eye from '@lucide/svelte/icons/eye';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import FilePenLine from '@lucide/svelte/icons/file-pen-line';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import GitMerge from '@lucide/svelte/icons/git-merge';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import CircleDot from '@lucide/svelte/icons/circle-dot';
	import ShieldAlert from '@lucide/svelte/icons/shield-alert';
	import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
	import Tag from '@lucide/svelte/icons/tag';
	import MessagesSquare from '@lucide/svelte/icons/messages-square';
	import Workflow from '@lucide/svelte/icons/workflow';
	import GitCommit from '@lucide/svelte/icons/git-commit-horizontal';
	import Bell from '@lucide/svelte/icons/bell';

	let { kind, lane, subjectType }: { kind: ActionKind; lane: Lane; subjectType: string } = $props();

	const byKind = {
		review: { icon: Eye, tone: 'text-signal-review bg-signal-review/12' },
		fix_ci: { icon: CircleX, tone: 'text-signal-fail bg-signal-fail/12' },
		address_review: { icon: FilePenLine, tone: 'text-signal-warn bg-signal-warn/14' },
		resolve_conflict: { icon: TriangleAlert, tone: 'text-signal-warn bg-signal-warn/14' },
		merge: { icon: GitMerge, tone: 'text-signal-merge bg-signal-merge/12' },
		reply: { icon: MessageCircle, tone: 'text-signal-reply bg-signal-reply/12' },
		triage: { icon: CircleDot, tone: 'text-signal-review bg-signal-review/12' },
		security: { icon: ShieldAlert, tone: 'text-signal-fail bg-signal-fail/12' }
	} as const;

	const bySubject: Record<string, typeof Bell> = {
		PullRequest: GitPullRequest,
		Issue: CircleDot,
		Release: Tag,
		Discussion: MessagesSquare,
		CheckSuite: Workflow,
		Commit: GitCommit
	};

	const spec = $derived(
		lane === 'turn' && kind !== 'none'
			? byKind[kind]
			: { icon: bySubject[subjectType] ?? Bell, tone: 'text-muted-foreground bg-muted' }
	);
</script>

<span class={cn('flex size-8 shrink-0 items-center justify-center rounded-full', spec.tone)}>
	<spec.icon class="size-4" />
</span>
