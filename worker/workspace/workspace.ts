import { ciRunning } from '../../src/lib/shared/ci';
import { DAY_MS } from '../../src/lib/shared/durations';
import type { DecisionAnswers, DecisionRequest } from '../../src/lib/shared/decisions';
import { projectKeyOf } from '../../src/lib/shared/grouping';
import { readsBoard } from '../../src/lib/shared/projects';
import type { DashKind, DashProject, TeamDTO } from '../../src/lib/shared/types';
import { analysisRequests, currentInputOf, mergeAnalysis } from '../../src/lib/model/analysis';
import type { SourceRead } from '../../src/lib/model/sources';
import type { SubjectFacts } from '../../src/lib/shared/subject';
import type { ItemId, ProjectFacet, SourceSpec } from '../../src/lib/model/types';
import { commit, type CommitResult, type Config, type Input, type WorkspaceData } from './commit';
import { planDelivery } from './deliver';
import type { ChannelOutcome, WorkspaceStore } from './store';
import type { PushMessage } from '../webpush';
import { keptSends } from '../../src/lib/shared/push-policy';
import { attentionState } from '../../src/lib/model/evaluate';
import { analysisView } from '../../src/lib/model/analysis';
import {
	analysisSpent,
	analysisUsed,
	ANALYSIS_RETRY_MS,
	bringDiscoveryForward,
	claimReads,
	githubOpen,
	readsFailed,
	type ReadClaims,
	MAX_ANALYSIS_QUEUE,
	nextUtcDay,
	SAFETY_READ_EVERY_MS,
	PROJECTS_EVERY_MS,
	TEAMS_EVERY_MS,
	TEAMS_RETRY_MS,
	cleanedUp,
	forgetReads,
	initialSync,
	nextWake,
	notificationsPolled,
	pausedIfIdle,
	planRun,
	rateLimited,
	readsDone,
	requestReads,
	sourcesRan,
	stopped,
	touched,
	withSources,
	type Interest,
	type NotificationCursor,
	type ReadPriority,
	type Sync
} from './work';

export const SYNC_KEY = 'sync';
export const FORGET_AFTER_MS = 30 * DAY_MS;
export const ALERT_HISTORY_MS = 30 * DAY_MS;
export const MAX_DEPARTURE_READS = 50;
export const MAX_PROJECT_READS = 200;

export interface NotificationThread {
	id: string;
	updatedAt: string;
	repo: string;
	number: number;
	kind: DashKind;
}

export type NotificationsResult =
	| {
			status: 'ok';
			threads: NotificationThread[];
			lastModified: string | null;
			pollIntervalMs: number;
	  }
	| { status: 'not-modified'; pollIntervalMs: number }
	| { status: 'rate-limited'; retryAt: number }
	| { status: 'unauthorized' }
	| { status: 'failed'; error: string };

export interface ItemsResult {
	read: SubjectFacts[];
	inaccessible: ItemId[];
	failed: ItemId[];
	retryAt?: number;
}

export interface SourcesResult {
	reads: Map<string, SourceRead>;
	retryAt?: number;
}

export interface Analyzed {
	answers: DecisionAnswers;
	tokens: number;
}

export interface ProjectStatuses {
	statusOf: Map<ItemId, Record<string, string | null>>;
	incomplete: Set<ItemId>;
	definitions: DashProject[];
}

export interface Readers {
	notifications(cursor: NotificationCursor): Promise<NotificationsResult>;
	sources(specs: SourceSpec[]): Promise<SourcesResult>;
	items(ids: ItemId[]): Promise<ItemsResult>;
	teams(): Promise<TeamDTO[] | null>;
	projects(ids: ItemId[]): Promise<ProjectStatuses>;
	analyze?(request: DecisionRequest): Promise<Analyzed | null>;
}

export type Channel = 'push' | 'slack';

export interface Sender {
	channels(): Promise<Channel[]>;
	send(message: PushMessage, channels: Channel[]): Promise<Record<Channel, ChannelOutcome>>;
}

export interface WorkspaceDeps {
	store: WorkspaceStore;
	readers: Readers;
	sender: Sender;
	origin: string;
	analysisBudget: number;
	setAlarm(at: number | null): void;
	announce(revision: number, viewIds: string[]): void;
	announceAlerts(): void;
	credentialRejected(): void;
}

const locatorOf = (repo: string, number: number) => `${repo.toLowerCase()}#${number}`;

export class Workspace {
	private interest: Interest = { ids: new Set(), ciRunning: new Set() };
	private storageFailed = false;

	private constructor(
		private readonly deps: WorkspaceDeps,
		private data: WorkspaceData,
		private sync: Sync
	) {}

	static open(deps: WorkspaceDeps, now: number): Workspace | null {
		const data = deps.store.load();
		if (!data) return null;
		const sync = deps.store.readState<Sync>(SYNC_KEY) ?? initialSync(now);
		const workspace = new Workspace(deps, data, sync);
		workspace.apply([], now);
		return workspace;
	}

	static create(deps: WorkspaceDeps, config: Config, now: number): Workspace {
		const workspace = new Workspace(deps, deps.store.create(config), initialSync(now));
		workspace.apply({ kind: 'settings', settings: config.settings }, now);
		return workspace;
	}

	get snapshot(): WorkspaceData {
		return this.data;
	}

	get schedule(): Sync {
		return this.sync;
	}

	get broken(): boolean {
		return this.storageFailed;
	}

	private persist(write: () => void) {
		if (this.storageFailed) throw new Error('This workspace failed to save. Open it again.');
		try {
			write();
		} catch (error) {
			this.storageFailed = true;
			throw error;
		}
	}

	apply(input: Input | Input[], now: number): CommitResult {
		const result = commit(this.data, input, now);
		const interest: Interest = {
			ids: result.interest,
			ciRunning: new Set(
				[...result.interest].filter((id) => ciRunning(result.data.items.get(id)?.facts.ci))
			)
		};
		const pending = new Set([...interest.ids, ...Object.keys(this.sync.reads)]);
		const remembered = new Set([...result.data.items.keys(), ...pending]);
		const sync: Sync = {
			...forgetReads(withSources(this.sync, result.data.sources.keys(), now), pending, remembered),
			boundaryAt: result.nextBoundary,
			analysis: this.analysisQueue(result.data, interest, now),
			deliveryDue: result.alerts.length ? now : this.sync.deliveryDue
		};
		this.persist(() => this.deps.store.save(result, now, { [SYNC_KEY]: sync }));
		this.data = result.data;
		this.interest = interest;
		this.sync = sync;
		if (result.changedViews.length) this.deps.announce(this.data.revision, result.changedViews);
		this.reschedule();
		return result;
	}

	private requestsFor(id: ItemId, now: number, data = this.data) {
		const item = data.items.get(id);
		if (!item) return [];
		const { me, settings, analysisVersion } = data.config;
		return analysisRequests(
			item.analysis,
			item.facts,
			me,
			settings.categoryGroups,
			analysisVersion,
			now
		);
	}

	private analysisQueue(data: WorkspaceData, interest: Interest, now: number): ItemId[] {
		if (!data.config.settings.smartDecisions || !this.deps.readers.analyze) return [];
		return [...interest.ids]
			.filter((id) => this.requestsFor(id, now, data).length > 0)
			.slice(0, MAX_ANALYSIS_QUEUE);
	}

	private saveSync(sync = this.sync) {
		this.persist(() => this.deps.store.writeState(SYNC_KEY, sync));
		this.sync = sync;
		this.reschedule();
	}

	private reschedule() {
		this.deps.setAlarm(nextWake(this.sync, this.interest));
	}

	touch(now: number) {
		this.saveSync(touched(this.sync, now));
	}

	requestRead(ids: ItemId[], priority: ReadPriority, now: number) {
		this.saveSync(requestReads(this.sync, ids, priority, now));
	}

	stop(reason: string) {
		this.saveSync(stopped(this.sync, reason));
	}

	appFocused(focusedUntil: number, now: number) {
		this.saveSync({ ...this.sync, focusedUntil, appSeenAt: now });
	}

	appBlurred(now: number) {
		this.saveSync({ ...this.sync, focusedUntil: 0, appSeenAt: now });
	}

	private stillCurrent(generation: number) {
		return (
			!this.storageFailed && this.sync.generation === generation && this.sync.lifecycle === 'active'
		);
	}

	private mayCallGithub(generation: number, now: number) {
		return this.stillCurrent(generation) && githubOpen(this.sync, now);
	}

	async run(clock: () => number): Promise<void> {
		this.sync = pausedIfIdle(this.sync, clock());
		const generation = this.sync.generation;
		const plan = planRun(this.sync, this.interest, clock());
		if (plan.teams) await this.refreshTeams(generation, clock);
		if (plan.notifications && this.mayCallGithub(generation, clock()))
			await this.pollNotifications(generation, clock);
		if (plan.sources.length && this.mayCallGithub(generation, clock()))
			await this.refreshSources(plan.sources, generation, clock);
		const reads = planRun(this.sync, this.interest, clock()).reads;
		if (reads.length && this.mayCallGithub(generation, clock()))
			await this.readItems(reads, generation, clock);
		if (plan.projects && this.mayCallGithub(generation, clock()))
			await this.refreshProjects(generation, clock);
		const analysis = planRun(this.sync, this.interest, clock()).analysis;
		if (analysis.length && this.stillCurrent(generation))
			await this.runAnalysis(analysis, generation, clock);
		if (plan.boundary && this.stillCurrent(generation)) this.apply({ kind: 'time' }, clock());
		if ((plan.delivery || this.sync.deliveryDue !== null) && this.stillCurrent(generation))
			await this.deliver(clock);
		if (plan.cleanup && this.stillCurrent(generation)) this.cleanup(clock());
		if (!this.storageFailed) this.saveSync();
	}

	private itemIdAt(repo: string, number: number): ItemId | null {
		const wanted = locatorOf(repo, number);
		for (const item of this.data.items.values())
			if (locatorOf(item.facts.repo, item.facts.number) === wanted) return item.id;
		return null;
	}

	private searchSourceIds() {
		return [...this.data.sources.values()]
			.filter((source) => source.spec.adapter === 'search')
			.map((source) => source.spec.id);
	}

	private async pollNotifications(generation: number, clock: () => number) {
		const result = await this.deps.readers.notifications(this.sync.notifications);
		if (!this.stillCurrent(generation)) return;
		const now = clock();
		if (result.status === 'rate-limited') {
			this.sync = rateLimited(this.sync, 'github', result.retryAt, 'GitHub rate limit.');
			return;
		}
		if (result.status === 'unauthorized') {
			this.sync = stopped(this.sync, 'GitHub rejected the token. Sign in again.');
			this.deps.credentialRejected();
			return;
		}
		if (result.status === 'failed') {
			this.sync = { ...notificationsPolled(this.sync, now, {}), lastError: result.error };
			return;
		}
		if (result.status === 'not-modified') {
			this.sync = notificationsPolled(this.sync, now, { pollIntervalMs: result.pollIntervalMs });
			return;
		}
		const fresh = result.threads.filter(
			(thread) => this.sync.notifications.versions[thread.id] !== thread.updatedAt
		);
		const known: ItemId[] = [];
		let unknown = false;
		for (const thread of fresh) {
			const id = this.itemIdAt(thread.repo, thread.number);
			if (id && this.interest.ids.has(id)) known.push(id);
			else unknown = true;
		}
		let sync = requestReads(this.sync, known, 'background', now);
		if (unknown) sync = bringDiscoveryForward(sync, this.searchSourceIds(), now);
		this.sync = notificationsPolled(sync, now, {
			lastModified: result.lastModified,
			pollIntervalMs: result.pollIntervalMs,
			versions: Object.fromEntries(fresh.map((thread) => [thread.id, thread.updatedAt]))
		});
	}

	private departedOpenMembers(reads: Map<string, SourceRead>): ItemId[] {
		const members = new Set([...this.data.views.values()].flatMap((state) => state.members));
		const departed = new Set<ItemId>();
		for (const [id, read] of reads) {
			if (read.outcome !== 'ok') continue;
			const now = new Set(read.window.candidates.map((candidate) => candidate.id));
			for (const candidate of this.data.sources.get(id)?.window?.candidates ?? [])
				if (!now.has(candidate.id) && members.has(candidate.id)) departed.add(candidate.id);
		}
		return [...departed]
			.filter((id) => this.data.items.get(id)?.facts.state === 'open')
			.slice(0, MAX_DEPARTURE_READS);
	}

	private needsRead(candidate: { id: ItemId; updatedAt: string }, now: number) {
		const stored = this.data.items.get(candidate.id);
		if (stored) return Date.parse(candidate.updatedAt) > Date.parse(stored.facts.updatedAt);
		return now - (this.sync.readAt[candidate.id] ?? 0) >= SAFETY_READ_EVERY_MS;
	}

	private async refreshSources(ids: string[], generation: number, clock: () => number) {
		const specs = ids.flatMap((id) => this.data.sources.get(id)?.spec ?? []);
		const result = await this.deps.readers.sources(specs);
		if (!this.stillCurrent(generation)) return;
		if (result.retryAt)
			this.sync = rateLimited(this.sync, 'github', result.retryAt, 'GitHub rate limit.');
		const departed = this.departedOpenMembers(result.reads);
		const claims = claimReads(this.sync, departed);
		const probe =
			departed.length && this.mayCallGithub(generation, clock())
				? await this.deps.readers.items(departed)
				: null;
		if (!this.stillCurrent(generation)) return;
		const now = clock();
		const inputs: Input[] = [...result.reads].map(([sourceId, read]) => ({
			kind: 'source',
			sourceId,
			read
		}));
		this.sync = sourcesRan(this.sync, result.reads.keys(), now);
		if (probe) {
			inputs.push(this.itemsInput(probe));
			this.sync = this.afterItemReads(claims, probe, now);
		}
		const hydrate = [...result.reads.values()].flatMap((read) =>
			read.outcome === 'ok'
				? read.window.candidates.filter((c) => this.needsRead(c, now)).map((c) => c.id)
				: []
		);
		this.sync = requestReads(this.sync, hydrate, 'background', now);
		this.apply(inputs, now);
	}

	private itemsInput(result: ItemsResult): Input {
		return {
			kind: 'items',
			read: result.read,
			inaccessible: result.inaccessible,
			quiet: !this.sync.notifications.initialized
		};
	}

	private afterItemReads(claims: ReadClaims, result: ItemsResult, now: number): Sync {
		const failed = new Set(result.failed);
		const pick = (keep: (id: ItemId) => boolean) =>
			Object.fromEntries(Object.entries(claims).filter(([id]) => keep(id)));
		let sync = readsDone(
			this.sync,
			pick((id) => !failed.has(id)),
			now
		);
		sync = readsFailed(
			sync,
			pick((id) => failed.has(id)),
			now
		);
		return result.retryAt
			? rateLimited(sync, 'github', result.retryAt, 'GitHub rate limit.')
			: sync;
	}

	private async readItems(ids: ItemId[], generation: number, clock: () => number) {
		const claims = claimReads(this.sync, ids);
		const result = await this.deps.readers.items(ids);
		if (!this.stillCurrent(generation)) return;
		const now = clock();
		this.sync = this.afterItemReads(claims, result, now);
		this.apply(this.itemsInput(result), now);
	}

	private heldByAttention(id: ItemId, now: number) {
		const item = this.data.items.get(id);
		if (!item) return true;
		const state = attentionState(item.attention, item.facts, this.data.config.me, now);
		return (
			state.kind === 'muted' ||
			(state.kind === 'snoozed' && (!!state.choice.event || state.choice.until !== undefined))
		);
	}

	private urgent(id: ItemId) {
		const item = this.data.items.get(id);
		if (!item) return false;
		const { me, settings, analysisVersion } = this.data.config;
		return analysisView(item.analysis, item.facts, me, settings.smartDecisions, analysisVersion)
			.decisions.urgent;
	}

	private async deliver(clock: () => number) {
		const now = clock();
		if (this.sync.deliveryDue === null || this.sync.deliveryDue > now) return;
		const pending = this.deps.store.pendingAlerts();
		const channels = pending.length ? await this.deps.sender.channels() : [];
		const lastPushes = this.deps.store.lastPushes();
		const { settings } = this.data.config;
		const plan = planDelivery(pending, {
			settings,
			now,
			origin: this.deps.origin,
			hasChannel: channels.length > 0,
			appInFocus: now < this.sync.focusedUntil,
			appSeenAt: this.sync.appSeenAt,
			state: this.sync.delivery,
			lastPushOf: (id) => lastPushes.get(id) ?? null,
			heldByAttention: (id) => this.heldByAttention(id, now),
			urgent: (id) => this.urgent(id)
		});
		this.persist(() => {
			for (const { alertId, reason } of plan.skip)
				this.deps.store.setDelivery(alertId, { status: 'skipped', reason });
		});
		let delivery = this.sync.delivery;
		for (const outgoing of plan.send) {
			const outcomes = await this.deps.sender.send(outgoing.message, channels);
			const sentAt = clock();
			if (Object.values(outcomes).includes('sent'))
				delivery = {
					recentSends: keptSends([...delivery.recentSends, sentAt], sentAt, settings.pushLimit),
					lastDigestAt: outgoing.digest ? sentAt : delivery.lastDigestAt
				};
			this.persist(() => {
				for (const alertId of outgoing.alertIds)
					this.deps.store.setDelivery(alertId, { status: 'sent', at: sentAt, channels: outcomes });
			});
		}
		if (plan.skip.length || plan.send.length) this.deps.announceAlerts();
		this.sync = { ...this.sync, delivery, deliveryDue: plan.waitUntil };
	}

	private async refreshTeams(generation: number, clock: () => number) {
		const teams = await this.deps.readers.teams();
		if (!this.stillCurrent(generation)) return;
		const now = clock();
		this.sync = { ...this.sync, teamsDue: now + (teams ? TEAMS_EVERY_MS : TEAMS_RETRY_MS) };
		if (teams) this.apply({ kind: 'teams', teams }, now);
	}

	private projectItemIds(): ItemId[] {
		const { settings, projectAccess } = this.data.config;
		if (projectAccess === 'none') return [];
		const wanted = settings.views.filter(
			(view) => projectKeyOf(view.groupBy) || view.searches.some(readsBoard)
		);
		const ids = wanted.flatMap((view) => {
			const state = this.data.views.get(view.id);
			return state ? [...state.members, ...state.retained] : [];
		});
		return [...new Set(ids)].slice(0, MAX_PROJECT_READS);
	}

	private facetAfter(id: ItemId, statuses: ProjectStatuses): ProjectFacet {
		const fresh = statuses.statusOf.get(id);
		if (fresh && !statuses.incomplete.has(id))
			return { state: 'known', statuses: fresh, stale: false };
		const previous = this.data.items.get(id)?.project;
		return previous?.state === 'known' ? { ...previous, stale: true } : { state: 'unknown' };
	}

	private async refreshProjects(generation: number, clock: () => number) {
		const ids = this.projectItemIds();
		this.sync = { ...this.sync, projectsDue: clock() + PROJECTS_EVERY_MS };
		if (!ids.length) return;
		const statuses = await this.deps.readers.projects(ids);
		if (!this.stillCurrent(generation)) return;
		this.apply(
			{
				kind: 'projects',
				facets: ids.map((id) => [id, this.facetAfter(id, statuses)]),
				definitions: statuses.definitions
			},
			clock()
		);
	}

	private async runAnalysis(ids: ItemId[], generation: number, clock: () => number) {
		const analyze = this.deps.readers.analyze;
		if (!analyze) return;
		const { me, analysisVersion } = this.data.config;
		const inputs: Input[] = [];
		for (const id of ids) {
			if (analysisSpent(this.sync, clock()) >= this.deps.analysisBudget) {
				this.sync = rateLimited(
					this.sync,
					'ai',
					nextUtcDay(clock()),
					'Smart decisions paused for today.'
				);
				break;
			}
			for (const asked of this.requestsFor(id, clock())) {
				const analyzed = await analyze(asked.request);
				if (!this.stillCurrent(generation)) return;
				if (!analyzed) {
					this.sync = rateLimited(
						this.sync,
						'ai',
						clock() + ANALYSIS_RETRY_MS,
						'Smart decisions did not answer.'
					);
					break;
				}
				this.sync = analysisUsed(this.sync, analyzed.tokens, clock());
				const item = this.data.items.get(id);
				if (!item || currentInputOf(asked.family, item.facts, me) !== asked.input) continue;
				const pending = inputs.findLast(
					(input): input is Extract<Input, { kind: 'analysis' }> =>
						input.kind === 'analysis' && input.itemId === id
				);
				const previous = pending?.analysis ?? item.analysis;
				inputs.push({
					kind: 'analysis',
					itemId: id,
					analysis: mergeAnalysis(previous, analysisVersion, asked, analyzed.answers)
				});
			}
			if (clock() < this.sync.retryAt.ai) break;
		}
		if (inputs.length) this.apply(inputs, clock());
	}

	private cleanup(now: number) {
		const keep = (id: ItemId) => {
			const item = this.data.items.get(id)!;
			const { attention } = item;
			const lastRead = this.sync.readAt[id] ?? 0;
			return (
				this.interest.ids.has(id) ||
				id in this.sync.reads ||
				attention.muted ||
				attention.snooze !== null ||
				attention.pins.length > 0 ||
				now - lastRead < FORGET_AFTER_MS
			);
		};
		const forget = [...this.data.items.keys()].filter((id) => !keep(id));
		if (forget.length) this.apply({ kind: 'forget', itemIds: forget }, now);
		this.deps.store.forgetAlertsBefore(now - ALERT_HISTORY_MS);
		this.sync = cleanedUp(this.sync, now);
	}
}
