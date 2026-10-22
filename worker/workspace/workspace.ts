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
import type { WorkspaceStore } from './store';
import {
	analysisSpent,
	analysisUsed,
	ANALYSIS_RETRY_MS,
	bringDiscoveryForward,
	MAX_ANALYSIS_QUEUE,
	nextUtcDay,
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

export interface WorkspaceDeps {
	store: WorkspaceStore;
	readers: Readers;
	analysisBudget: number;
	setAlarm(at: number | null): void;
	announce(revision: number, viewIds: string[]): void;
	credentialRejected(): void;
}

const locatorOf = (repo: string, number: number) => `${repo.toLowerCase()}#${number}`;

export class Workspace {
	private interest: Interest = { ids: new Set(), ciRunning: new Set() };

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

	apply(input: Input | Input[], now: number): CommitResult {
		const result = commit(this.data, input, now);
		this.data = result.data;
		this.interest = {
			ids: result.interest,
			ciRunning: new Set(
				[...result.interest].filter((id) => ciRunning(this.data.items.get(id)?.facts.ci))
			)
		};
		this.sync = {
			...forgetReads(withSources(this.sync, this.data.sources.keys(), now), this.knownIds()),
			boundaryAt: result.nextBoundary,
			analysis: this.analysisQueue(now)
		};
		this.deps.store.save(result, now, { [SYNC_KEY]: this.sync });
		if (result.changedViews.length) this.deps.announce(this.data.revision, result.changedViews);
		this.reschedule();
		return result;
	}

	private analysisWanted() {
		return this.data.config.settings.smartDecisions && !!this.deps.readers.analyze;
	}

	private requestsFor(id: ItemId, now: number) {
		const item = this.data.items.get(id);
		if (!item) return [];
		const { me, settings, analysisVersion } = this.data.config;
		return analysisRequests(
			item.analysis,
			item.facts,
			me,
			settings.categoryGroups,
			analysisVersion,
			now
		);
	}

	private analysisQueue(now: number): ItemId[] {
		if (!this.analysisWanted()) return [];
		return [...this.interest.ids]
			.filter((id) => this.requestsFor(id, now).length > 0)
			.slice(0, MAX_ANALYSIS_QUEUE);
	}

	private knownIds() {
		return new Set([...this.interest.ids, ...Object.keys(this.sync.reads)]);
	}

	private saveSync() {
		this.deps.store.writeState(SYNC_KEY, this.sync);
		this.reschedule();
	}

	private reschedule() {
		this.deps.setAlarm(nextWake(this.sync, this.interest));
	}

	touch(now: number) {
		this.sync = touched(this.sync, now);
		this.saveSync();
	}

	requestRead(ids: ItemId[], priority: ReadPriority) {
		this.sync = requestReads(this.sync, ids, priority);
		this.saveSync();
	}

	stop(reason: string) {
		this.sync = stopped(this.sync, reason);
		this.saveSync();
	}

	private stillCurrent(generation: number) {
		return this.sync.generation === generation && this.sync.lifecycle === 'active';
	}

	async run(clock: () => number): Promise<void> {
		this.sync = pausedIfIdle(this.sync, clock());
		const generation = this.sync.generation;
		const plan = planRun(this.sync, this.interest, clock());
		if (plan.teams) await this.refreshTeams(generation, clock);
		if (plan.notifications && this.stillCurrent(generation))
			await this.pollNotifications(generation, clock);
		if (plan.sources.length && this.stillCurrent(generation))
			await this.refreshSources(plan.sources, generation, clock);
		const reads = planRun(this.sync, this.interest, clock()).reads;
		if (reads.length && this.stillCurrent(generation))
			await this.readItems(reads, generation, clock);
		if (plan.projects && this.stillCurrent(generation))
			await this.refreshProjects(generation, clock);
		const analysis = planRun(this.sync, this.interest, clock()).analysis;
		if (analysis.length && this.stillCurrent(generation))
			await this.runAnalysis(analysis, generation, clock);
		if (plan.boundary && this.stillCurrent(generation)) this.apply({ kind: 'time' }, clock());
		if (plan.cleanup && this.stillCurrent(generation)) this.cleanup(clock());
		this.saveSync();
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
		let sync = requestReads(this.sync, known, 'background');
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

	private needsRead(candidate: { id: ItemId; updatedAt: string }) {
		const stored = this.data.items.get(candidate.id);
		return !stored || Date.parse(candidate.updatedAt) > Date.parse(stored.facts.updatedAt);
	}

	private async refreshSources(ids: string[], generation: number, clock: () => number) {
		const specs = ids.flatMap((id) => this.data.sources.get(id)?.spec ?? []);
		const result = await this.deps.readers.sources(specs);
		if (!this.stillCurrent(generation)) return;
		if (result.retryAt)
			this.sync = rateLimited(this.sync, 'github', result.retryAt, 'GitHub rate limit.');
		const departed = this.departedOpenMembers(result.reads);
		const probe = departed.length ? await this.deps.readers.items(departed) : null;
		if (!this.stillCurrent(generation)) return;
		const now = clock();
		const inputs: Input[] = [...result.reads].map(([sourceId, read]) => ({
			kind: 'source',
			sourceId,
			read
		}));
		if (probe)
			inputs.push({
				kind: 'items',
				read: probe.read,
				inaccessible: probe.inaccessible,
				quiet: !this.sync.notifications.initialized
			});
		this.sync = sourcesRan(this.sync, result.reads.keys(), now);
		if (probe)
			this.sync = readsDone(
				this.sync,
				departed.filter((id) => !probe.failed.includes(id)),
				now
			);
		const hydrate = [...result.reads.values()].flatMap((read) =>
			read.outcome === 'ok'
				? read.window.candidates.filter((c) => this.needsRead(c)).map((c) => c.id)
				: []
		);
		this.sync = requestReads(this.sync, hydrate, 'background');
		this.apply(inputs, now);
	}

	private async readItems(ids: ItemId[], generation: number, clock: () => number) {
		const result = await this.deps.readers.items(ids);
		if (!this.stillCurrent(generation)) return;
		const now = clock();
		if (result.retryAt)
			this.sync = rateLimited(this.sync, 'github', result.retryAt, 'GitHub rate limit.');
		this.sync = readsDone(
			this.sync,
			ids.filter((id) => !result.failed.includes(id)),
			now
		);
		this.apply(
			{
				kind: 'items',
				read: result.read,
				inaccessible: result.inaccessible,
				quiet: !this.sync.notifications.initialized
			},
			now
		);
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
