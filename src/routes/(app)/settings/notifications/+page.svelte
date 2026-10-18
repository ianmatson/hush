<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { meQuery } from '$lib/queries';
	import { saveSettings, togglePushFact } from '$lib/save-settings';
	import { PUSH_FACTS } from '$lib/shared/push-facts';
	import {
		CLEAR_NOTIFICATIONS_OPTIONS,
		DIGEST_MINUTES,
		LIMIT_COUNT,
		LIMIT_MINUTES,
		PUSH_REPEAT_OPTIONS,
		type PushLimit
	} from '$lib/shared/push-policy';
	import * as Card from '$lib/components/ui/card';
	import SavedSwitch from '$lib/components/app/settings/saved-switch.svelte';
	import SettingRow from '$lib/components/app/setting-row.svelte';
	import SettingSelect from '$lib/components/app/settings/setting-select.svelte';
	import NumberSetting from '$lib/components/app/settings/number-setting.svelte';
	import PushDevices from '$lib/components/app/settings/push-devices.svelte';
	import QuietHoursSettings from '$lib/components/app/settings/quiet-hours-settings.svelte';
	import SlackSettings from '$lib/components/app/settings/slack-settings.svelte';

	const DEFAULT_DIGEST_MINUTES = 30;
	const DEFAULT_PUSH_LIMIT: PushLimit = { count: 6, minutes: 30 };

	const me = createQuery(meQuery);
	const settings = $derived(me.data?.settings);
</script>

<svelte:head><title>Notifications · Settings · Hush</title></svelte:head>

<div class="grid gap-6">
	<div>
		<h1 class="hidden text-lg font-semibold tracking-tight md:block">Notifications</h1>
		<p class="text-sm text-muted-foreground">
			Native push notifications, also when Hush is closed.
		</p>
	</div>

	<PushDevices />

	<SlackSettings />

	{#if settings}
		<Card.Root>
			<Card.Header>
				<Card.Title>What to push</Card.Title>
				<Card.Description
					>Hush pushes when one of these becomes true for a pull request or issue in your views.
					Each view can also push its new items (<a class="underline" href="/settings/views"
						>Views</a
					>).</Card.Description
				>
			</Card.Header>
			<Card.Content class="divide-y">
				{#each PUSH_FACTS as fact (fact.id)}
					<SettingRow id="push-{fact.id}" label={fact.label} description={fact.note}>
						<SavedSwitch
							id="push-{fact.id}"
							checked={settings.pushFacts.includes(fact.id)}
							onsave={(on) => togglePushFact(fact.id, on)}
						/>
					</SettingRow>
				{/each}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>How often</Card.Title>
				<Card.Description
					>Fewer buzzes on busy days. Each PR or issue has one notification, which later pushes
					replace.</Card.Description
				>
			</Card.Header>
			<Card.Content class="divide-y">
				<SettingRow
					label="Push the same item again"
					description="Opening Hush, or reading the item on GitHub, lets it push again."
				>
					<SettingSelect
						class="w-64"
						label="Push the same item again"
						value={settings.pushRepeat}
						options={PUSH_REPEAT_OPTIONS}
						onchange={(pushRepeat) => saveSettings({ pushRepeat })}
					/>
				</SettingRow>
				<SettingRow
					id="push-digest"
					label="Digest"
					description="Send pushes together, as one notification at a fixed interval."
				>
					<SavedSwitch
						id="push-digest"
						checked={settings.pushDigestMinutes !== null}
						onsave={(v) => saveSettings({ pushDigestMinutes: v ? DEFAULT_DIGEST_MINUTES : null })}
					/>
					{#snippet extra()}
						{#if settings.pushDigestMinutes !== null}
							<NumberSetting
								before="Every"
								after="minutes"
								value={settings.pushDigestMinutes}
								range={DIGEST_MINUTES}
								onsave={(pushDigestMinutes) => saveSettings({ pushDigestMinutes })}
							/>
						{/if}
					{/snippet}
				</SettingRow>
				<SettingRow
					id="push-limit"
					label="Limit"
					description="After this many pushes, the rest wait and go as one digest."
				>
					<SavedSwitch
						id="push-limit"
						checked={settings.pushLimit !== null}
						onsave={(v) => saveSettings({ pushLimit: v ? DEFAULT_PUSH_LIMIT : null })}
					/>
					{#snippet extra()}
						{#if settings.pushLimit}
							{@const limit = settings.pushLimit}
							<div class="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
								<NumberSetting
									before="At most"
									after="pushes"
									value={limit.count}
									range={LIMIT_COUNT}
									onsave={(count) => saveSettings({ pushLimit: { ...limit, count } })}
								/>
								<NumberSetting
									before="in"
									after="minutes"
									value={limit.minutes}
									range={LIMIT_MINUTES}
									onsave={(minutes) => saveSettings({ pushLimit: { ...limit, minutes } })}
								/>
							</div>
						{/if}
					{/snippet}
				</SettingRow>
				{#if settings.smartDecisions}
					<SettingRow
						id="push-urgent-now"
						label="Push blocking items at once"
						description="A push about an item whose text says it blocks something or is an incident skips the digest and the limit. Quiet hours still hold it."
					>
						<SavedSwitch
							id="push-urgent-now"
							checked={settings.pushUrgentNow}
							onsave={(v) => saveSettings({ pushUrgentNow: v })}
						/>
					</SettingRow>
				{/if}
				<SettingRow
					id="push-while-open"
					label="Push while Hush is open"
					description="Off: while you use Hush on a device, new items show only in Hush."
				>
					<SavedSwitch
						id="push-while-open"
						checked={settings.pushWhileOpen}
						onsave={(v) => saveSettings({ pushWhileOpen: v })}
					/>
				</SettingRow>
				<SettingRow
					label="Clear notifications"
					description="Remove Hush notifications from a device when you use Hush there."
				>
					<SettingSelect
						class="w-64"
						label="Clear notifications"
						value={settings.clearNotifications}
						options={CLEAR_NOTIFICATIONS_OPTIONS}
						onchange={(clearNotifications) => saveSettings({ clearNotifications })}
					/>
				</SettingRow>
			</Card.Content>
		</Card.Root>

		<QuietHoursSettings quiet={settings.quietHours} />
	{/if}
</div>
