import { ruleMatches } from '../../src/lib/shared/classify';
import {
	conditionId,
	estimateTokens,
	mergeDecisions,
	parseStoredDecisions,
	planDecisions,
	readDecisions,
	smartConditions,
	type DecisionPlan,
	type SmartCondition,
	type StoredDecisions,
	type SubjectDecisions
} from '../../src/lib/shared/decisions';
import { compileQuery } from '../../src/lib/shared/query';
import { enrichmentOf, subjectKey, type SubjectFacts } from '../../src/lib/shared/subject';
import type { Classification, RuleMatch, Settings } from '../../src/lib/shared/types';
import { dailyTokenBudget, decide, decisionsAvailable } from '../decide';
import { PollerAlerts } from './alerts';
import type { Who } from './shared';

const DECISION_CONCURRENCY = 6;
const SQL_BATCH = 90;
const marks = (n: number) => Array(n).fill('?').join(',');

export const DECISION_FILL_KEY = 'decisionFill';
const USAGE_KEY = 'decisionUsage';

interface DecisionUsage {
	day: string;
	tokens: number;
	calls: number;
}

type ConditionScope = { condition: SmartCondition; exactParts: RuleMatch[] };

const NO_CLASSIFICATION = { category: 'fyi', kind: 'none' } as Classification;
const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

function exactPartsOf(when: RuleMatch): RuleMatch {
	const { about: _about, reason: _reason, kind: _kind, category: _category, ...exact } = when;
	return exact;
}

function conditionScopes(settings: Settings): ConditionScope[] {
	const queries = [
		...settings.rules.filter((r) => r.enabled !== false).map((r) => r.when ?? ''),
		...settings.views.map((v) => v.query ?? '')
	].map(compileQuery);
	return smartConditions(settings.rules, settings.views).map((condition) => ({
		condition,
		exactParts: queries
			.filter((q) => q.about?.some((text) => conditionId(text) === condition.id))
			.map(exactPartsOf)
	}));
}

export abstract class PollerDecisions extends PollerAlerts {
	protected decisionsOn(settings: Settings): boolean {
		return settings.smartDecisions && decisionsAvailable(this.env);
	}

	private storedDecisions(keys: string[]): Map<string, StoredDecisions> {
		const out = new Map<string, StoredDecisions>();
		for (let i = 0; i < keys.length; i += SQL_BATCH) {
			const batch = keys.slice(i, i + SQL_BATCH);
			for (const r of this.all<{ key: string; answers: string }>(
				`SELECT key, answers FROM decisions WHERE key IN (${marks(batch.length)})`,
				...batch
			)) {
				const stored = parseStoredDecisions(r.answers);
				if (stored) out.set(r.key, stored);
			}
		}
		return out;
	}

	private keysWithInboxThreads(keys: string[]): Set<string> {
		const out = new Set<string>();
		for (let i = 0; i < keys.length; i += SQL_BATCH) {
			const batch = keys.slice(i, i + SQL_BATCH);
			for (const r of this.all<{ subject_key: string }>(
				`SELECT DISTINCT subject_key FROM threads WHERE category != 'muted' AND subject_key IN (${marks(batch.length)})`,
				...batch
			))
				out.add(r.subject_key);
		}
		return out;
	}

	protected decisionsOf(who: Who, subjects: SubjectFacts[]): Map<string, SubjectDecisions> {
		const out = new Map<string, SubjectDecisions>();
		if (!who.settings.smartDecisions || !subjects.length) return out;
		const keyed = subjects.map((s) => [subjectKey(s.repo, s.number), s] as const);
		const stored = this.storedDecisions(keyed.map(([k]) => k));
		for (const [k, s] of keyed) out.set(k, readDecisions(stored.get(k), s));
		return out;
	}

	protected async decisionUsage(now = Date.now()): Promise<DecisionUsage> {
		const usage = await this.ctx.storage.get<DecisionUsage>(USAGE_KEY);
		return usage?.day === utcDay(now) ? usage : { day: utcDay(now), tokens: 0, calls: 0 };
	}

	protected async decisionsPaused(): Promise<boolean> {
		return (await this.decisionUsage()).tokens >= dailyTokenBudget(this.env);
	}

	protected async decideSubjects(
		who: Who,
		subjects: SubjectFacts[],
		opts: { allAreInboxThreads?: boolean } = {}
	): Promise<void> {
		if (!this.decisionsOn(who.settings) || !subjects.length) return;
		const keyed = new Map(subjects.map((s) => [subjectKey(s.repo, s.number), s]));
		const keys = [...keyed.keys()];
		const stored = this.storedDecisions(keys);
		const scopes = conditionScopes(who.settings);
		const inboxKeys: Set<string> = !scopes.length
			? new Set()
			: opts.allAreInboxThreads
				? new Set(keys)
				: this.keysWithInboxThreads(keys);
		const plans: { key: string; plan: DecisionPlan }[] = [];
		for (const [key, s] of keyed) {
			const conditions = inboxKeys.has(key) ? this.conditionsFor(s, who, scopes) : [];
			const plan = planDecisions(s, who.me, stored.get(key), conditions);
			if (plan) plans.push({ key, plan });
		}
		if (plans.length) await this.runPlans(plans, stored);
	}

	private conditionsFor(s: SubjectFacts, who: Who, scopes: ConditionScope[]): SmartCondition[] {
		const facts = {
			repo: s.repo,
			subjectType: s.kind === 'pr' ? 'PullRequest' : 'Issue',
			title: s.title,
			reason: '',
			htmlUrl: s.url,
			enrichment: enrichmentOf(s, who.me),
			me: who.me
		};
		return scopes
			.filter(({ exactParts }) =>
				exactParts.some((when) => ruleMatches(when, facts, NO_CLASSIFICATION))
			)
			.map(({ condition }) => condition);
	}

	private async runPlans(
		plans: { key: string; plan: DecisionPlan }[],
		stored: Map<string, StoredDecisions>
	): Promise<void> {
		const usage = await this.decisionUsage();
		const budget = dailyTokenBudget(this.env);
		const answered: [string, StoredDecisions][] = [];
		const queue = [...plans];
		const work = async () => {
			for (let next = queue.shift(); next; next = queue.shift()) {
				if (usage.tokens >= budget) return;
				const reserved = estimateTokens(next.plan.request);
				usage.tokens += reserved;
				const out = await decide(this.env, next.plan.request);
				usage.tokens += (out?.tokens ?? 0) - reserved;
				usage.calls++;
				if (out)
					answered.push([next.key, mergeDecisions(stored.get(next.key), next.plan, out.answers)]);
			}
		};
		await Promise.all(Array.from({ length: Math.min(DECISION_CONCURRENCY, plans.length) }, work));
		await this.ctx.storage.put(USAGE_KEY, usage);
		if (!answered.length) return;
		const now = Date.now();
		this.transaction(() => {
			for (const [key, answers] of answered)
				this.run(
					`INSERT INTO decisions (key, answers, at) VALUES (?, ?, ?)
           ON CONFLICT (key) DO UPDATE SET answers = excluded.answers, at = excluded.at`,
					key,
					JSON.stringify(answers),
					now
				);
		});
	}

	protected forgetDecisions(): void {
		this.run('DELETE FROM decisions');
	}
}
