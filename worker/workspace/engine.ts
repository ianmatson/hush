import { ciRunning } from '../../src/lib/shared/ci';
import type { DecisionAnswers, DecisionRequest } from '../../src/lib/shared/decisions';
import { DAY_MS } from '../../src/lib/shared/durations';
import { projectKeyOf } from '../../src/lib/shared/grouping';
import { readsBoard } from '../../src/lib/shared/projects';
import { keptSends } from '../../src/lib/shared/push-policy';
import type { SubjectFacts } from '../../src/lib/shared/subject';
import type { DashKind, DashProject, TeamDTO } from '../../src/lib/shared/types';
import {
	analysisRequests,
	analysisView,
	currentInputOf,
	mergeAnalysis,
	type AnalysisRequest
} from '../../src/lib/model/analysis';
import { attentionState } from '../../src/lib/model/evaluate';
import type { SourceRead } from '../../src/lib/model/sources';
import type { ItemId, ProjectFacet, SourceSpec } from '../../src/lib/model/types';
import { CallBudget } from '../github';
import type { PushMessage } from '../webpush';
import { commit, type CommitResult, type Config, type Input, type WorkspaceData } from './commit';
import { planDelivery } from './deliver';
import type { ChannelOutcome, WorkspaceStore } from './store';
import {
	analysisSpent,
	analysisUsed,
	ALERT_HISTORY_MS,
	ANALYSIS_RETRY_MS,
	bringDiscoveryForward,
	claimReads,
	cleanedUp,
	forgetReads,
	githubOpen,
	initialSync,
	MAX_ANALYSIS_QUEUE,
	nextUtcDay,
	nextWake,
	notificationsPolled,
	pausedIfIdle,
	planRun,
	PROJECTS_EVERY_MS,
	rateLimited,
	readsDone,
	readsFailed,
	requestReads,
	SAFETY_READ_EVERY_MS,
	sourcesRan,
	stopped,
	TEAMS_EVERY_MS,
	TEAMS_RETRY_MS,
	touched,
	withSources,
	type Interest,
	type NotificationCursor,
	type ReadClaims,
	type ReadPriority,
	type Sync
} from './work';

export const SYNC_KEY = 'sync';
export const FORGET_AFTER_MS = 30 * DAY_MS;
export const MAX_DEPARTURE_READS = 50;
export const MAX_PROJECT_READS = 200;
export const RUN_CALL_BUDGET = 40;

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
}

export interface SourcesResult {
	reads: Map<string, SourceRead>;
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
	notifications(cursor: NotificationCursor, budget: CallBudget): Promise<NotificationsResult>;
	sources(specs: SourceSpec[], budget: CallBudget): Promise<SourcesResult>;
	items(ids: ItemId[], budget: CallBudget): Promise<ItemsResult>;
	teams(budget: CallBudget): Promise<TeamDTO[] | null>;
	projects(ids: ItemId[], budget: CallBudget): Promise<ProjectStatuses>;
	analyze?(request: DecisionRequest): Promise<Analyzed | null>;
}

interface Run {
	generation: number;
	clock: () => number;
	budget: CallBudget;
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

export class WorkspaceEngine {
	private interest: Interest = { ids: new Set(), ciRunning: new Set() };
	private storageFailed = false;

	private constructor(
		private readonly deps: WorkspaceDeps,
		private data: WorkspaceData,
		private sync: Sync
	) {}

	static open(deps: WorkspaceDeps, now: number): WorkspaceEngine | null {
		const data = deps.store.load();
		if (!data) return null;
		const sync = deps.store.readState<Sync>(SYNC_KEY) ?? initialSync(now);
		const workspace = new WorkspaceEngine(deps, data, sync);
		workspace.apply([], now);
		return workspace;
	}

	static create(deps: WorkspaceDeps, config: Config, now: number): WorkspaceEngine {
		const workspace = new WorkspaceEngine(deps, deps.store.create(config), initialSync(now));
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
		const resumed = this.sync.lifecycle === 'paused';
		const next = touched(this.sync, now);
		this.saveSync(resumed ? { ...next, quietReads: [...this.interest.ids] } : next);
		if (resumed) this.apply({ kind: 'reseed' }, now);
	}

	requestRead(ids: ItemId[], priority: ReadPriority, now: number) {
		this.saveSync(requestReads(this.sync, ids, priority, now));
	}

	stop(reason: string) {
		this.saveSync(stopped(this.sync, reason));
	}

	itemAt(repo: string, number: number): ItemId | null {
		return this.itemIdAt(repo, number);
	}

	refreshBoards(now: number) {
		const boards = [...this.data.sources.values()].filter((s) => s.spec.adapter === 'board');
		const sourcesDue = { ...this.sync.sourcesDue };
		for (const board of boards) sourcesDue[board.spec.id] = now;
		this.saveSync({ ...this.sync, sourcesDue, projectsDue: now });
	}

	refreshEverything(now: number) {
		const sourcesDue = Object.fromEntries(Object.keys(this.sync.sourcesDue).map((id) => [id, now]));
		this.saveSync({
			...this.sync,
			sourcesDue,
			projectsDue: now,
			notifications: { ...this.sync.notifications, dueAt: now }
		});
	}

	refreshTeamsSoon(now: number) {
		this.saveSync({ ...this.sync, teamsDue: now });
	}

	deliverSoon(now: number) {
		this.saveSync({ ...this.sync, deliveryDue: now });
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

	private mayCallGithub(run: Run) {
		return (
			this.stillCurrent(run.generation) && run.budget.open && githubOpen(this.sync, run.clock())
		);
	}

	private noteBudget(run: Run) {
		if (run.budget.retryAt !== null)
			this.sync = rateLimited(this.sync, 'github', run.budget.retryAt, 'GitHub rate limit.');
	}

	async run(clock: () => number): Promise<void> {
		this.sync = pausedIfIdle(this.sync, clock());
		const run: Run = {
			generation: this.sync.generation,
			clock,
			budget: new CallBudget(RUN_CALL_BUDGET)
		};
		const plan = planRun(this.sync, this.interest, clock());
		if (plan.teams && this.mayCallGithub(run)) await this.refreshTeams(run);
		if (plan.notifications && this.mayCallGithub(run)) await this.pollNotifications(run);
		if (plan.sources.length && this.mayCallGithub(run))
			await this.refreshSources(plan.sources, run);
		const reads = planRun(this.sync, this.interest, clock()).reads;
		if (reads.length && this.mayCallGithub(run)) await this.readItems(reads, run);
		if (plan.projects && this.mayCallGithub(run)) await this.refreshProjects(run);
		const analysis = planRun(this.sync, this.interest, clock()).analysis;
		if (analysis.length && this.stillCurrent(run.generation)) await this.runAnalysis(analysis, run);
		if (plan.boundary && this.stillCurrent(run.generation)) this.apply({ kind: 'time' }, clock());
		if ((plan.delivery || this.sync.deliveryDue !== null) && this.stillCurrent(run.generation))
			await this.deliver(clock);
		if (plan.cleanup && this.stillCurrent(run.generation)) this.cleanup(clock());
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

	private async pollNotifications(run: Run) {
		const result = await this.deps.readers.notifications(this.sync.notifications, run.budget);
		if (!this.stillCurrent(run.generation)) return;
		const now = run.clock();
		this.noteBudget(run);
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

	private async refreshSources(ids: string[], run: Run) {
		const specs = ids.flatMap((id) => this.data.sources.get(id)?.spec ?? []);
		const result = await this.deps.readers.sources(specs, run.budget);
		if (!this.stillCurrent(run.generation)) return;
		this.noteBudget(run);
		const departed = this.departedOpenMembers(result.reads);
		const claims = claimReads(this.sync, departed);
		const probe =
			departed.length && this.mayCallGithub(run)
				? await this.deps.readers.items(departed, run.budget)
				: null;
		if (!this.stillCurrent(run.generation)) return;
		const now = run.clock();
		this.noteBudget(run);
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
		const quiet = new Set(this.sync.quietReads);
		return {
			kind: 'items',
			read: result.read,
			inaccessible: result.inaccessible,
			quiet: false,
			quietIds: result.read.map((facts) => facts.id).filter((id) => quiet.has(id))
		};
	}

	private afterItemReads(claims: ReadClaims, result: ItemsResult, now: number): Sync {
		const failed = new Set(result.failed);
		const pick = (keep: (id: ItemId) => boolean) =>
			Object.fromEntries(Object.entries(claims).filter(([id]) => keep(id)));
		const done = readsDone(
			this.sync,
			pick((id) => !failed.has(id)),
			now
		);
		return readsFailed(
			done,
			pick((id) => failed.has(id)),
			now
		);
	}

	private async readItems(ids: ItemId[], run: Run) {
		const claims = claimReads(this.sync, ids);
		const result = await this.deps.readers.items(ids, run.budget);
		if (!this.stillCurrent(run.generation)) return;
		const now = run.clock();
		this.noteBudget(run);
		const input = this.itemsInput(result);
		this.sync = this.afterItemReads(claims, result, now);
		this.apply(input, now);
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

	private async refreshTeams(run: Run) {
		const teams = await this.deps.readers.teams(run.budget);
		if (!this.stillCurrent(run.generation)) return;
		const now = run.clock();
		this.noteBudget(run);
		this.sync = { ...this.sync, teamsDue: now + (teams ? TEAMS_EVERY_MS : TEAMS_RETRY_MS) };
		if (teams) this.apply({ kind: 'teams', teams }, now);
	}

	private projectItemIds(): ItemId[] {
		const { settings, projectAccess } = this.data.config;
		if (projectAccess === 'none') return [];
		const wanted = settings.views.filter(
			(view) => projectKeyOf(view.groupBy) || view.searches.some(readsBoard)
		);
		const ids = new Set(
			wanted.flatMap((view) => {
				const state = this.data.views.get(view.id);
				return state ? [...state.members, ...state.retained] : [];
			})
		);
		const readAt = (id: ItemId) => this.sync.projectReadAt[id] ?? 0;
		return [...ids].sort((a, b) => readAt(a) - readAt(b)).slice(0, MAX_PROJECT_READS);
	}

	private facetAfter(id: ItemId, statuses: ProjectStatuses): ProjectFacet {
		const fresh = statuses.statusOf.get(id);
		if (fresh && !statuses.incomplete.has(id))
			return { state: 'known', statuses: fresh, stale: false };
		const previous = this.data.items.get(id)?.project;
		return previous?.state === 'known' ? { ...previous, stale: true } : { state: 'unknown' };
	}

	private async refreshProjects(run: Run) {
		const ids = this.projectItemIds();
		const startedAt = run.clock();
		this.sync = { ...this.sync, projectsDue: startedAt + PROJECTS_EVERY_MS };
		if (!ids.length) return;
		const statuses = await this.deps.readers.projects(ids, run.budget);
		if (!this.stillCurrent(run.generation)) return;
		this.noteBudget(run);
		const projectReadAt = Object.fromEntries(
			Object.entries(this.sync.projectReadAt).filter(([id]) => this.data.items.has(id))
		);
		for (const id of ids) projectReadAt[id] = startedAt;
		this.sync = { ...this.sync, projectReadAt };
		this.apply(
			{
				kind: 'projects',
				facets: ids.map((id) => [id, this.facetAfter(id, statuses)]),
				definitions: statuses.definitions
			},
			run.clock()
		);
	}

	private analysisPaused(now: number) {
		if (now < this.sync.retryAt.ai) return true;
		if (analysisSpent(this.sync, now) < this.deps.analysisBudget) return false;
		this.sync = rateLimited(this.sync, 'ai', nextUtcDay(now), 'Smart decisions paused for today.');
		return true;
	}

	private acceptAnswer(id: ItemId, asked: AnalysisRequest, answers: DecisionAnswers, now: number) {
		const item = this.data.items.get(id);
		const { me, analysisVersion } = this.data.config;
		if (!item || currentInputOf(asked.family, item.facts, me) !== asked.input) return;
		const analysis = mergeAnalysis(item.analysis, analysisVersion, asked, answers);
		if (!analysis) {
			this.sync = rateLimited(
				this.sync,
				'ai',
				now + ANALYSIS_RETRY_MS,
				'Smart decisions gave no answer.'
			);
			return;
		}
		this.apply({ kind: 'analysis', itemId: id, analysis }, now);
	}

	private async runAnalysis(ids: ItemId[], run: Run) {
		const analyze = this.deps.readers.analyze;
		if (!analyze) return;
		for (const id of ids)
			for (const asked of this.requestsFor(id, run.clock())) {
				if (this.analysisPaused(run.clock())) return;
				const analyzed = await analyze(asked.request);
				if (!this.stillCurrent(run.generation)) return;
				const now = run.clock();
				if (!analyzed) {
					this.sync = rateLimited(
						this.sync,
						'ai',
						now + ANALYSIS_RETRY_MS,
						'Smart decisions did not answer.'
					);
					return;
				}
				this.sync = analysisUsed(this.sync, analyzed.tokens, now);
				this.acceptAnswer(id, asked, analyzed.answers, now);
			}
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
