import {
	estimateTokens,
	type DecisionAnswers,
	type DecisionRequest
} from '../src/lib/shared/decisions';

export const DEFAULT_DECISION_MODEL = 'typesafe/jev';
export const DEFAULT_DAILY_TOKENS = 1_000_000;
const DECISION_WAIT_MS = 8_000;

export interface DecisionModel {
	run(
		model: string,
		inputs: DecisionRequest,
		options?: { signal?: AbortSignal; tags?: string[] }
	): Promise<unknown>;
}

export interface DecisionEnv {
	AI?: DecisionModel;
	DECISIONS?: string;
	DECISION_MODEL?: string;
	DECISION_DAILY_TOKENS?: string;
}

export interface Decided {
	answers: DecisionAnswers;
	tokens: number;
	model: string | null;
}

export const decisionsAvailable = (env: DecisionEnv) => !!env.AI && env.DECISIONS !== 'off';

export function dailyTokenBudget(env: DecisionEnv): number {
	const n = Number(env.DECISION_DAILY_TOKENS);
	return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_TOKENS;
}

interface ModelResponse {
	model?: string;
	answers?: DecisionAnswers;
	usage?: { input_tokens?: number };
}

export async function decide(env: DecisionEnv, request: DecisionRequest): Promise<Decided | null> {
	if (!env.AI) return null;
	const noAnswer = new AbortController();
	const waitForAnswer = setTimeout(
		() => noAnswer.abort(new DOMException('The operation timed out.', 'TimeoutError')),
		DECISION_WAIT_MS
	);
	try {
		const res = (await env.AI.run(env.DECISION_MODEL || DEFAULT_DECISION_MODEL, request, {
			signal: noAnswer.signal,
			tags: ['hush-decisions']
		})) as ModelResponse | null;
		if (!res?.answers || typeof res.answers !== 'object') return null;
		return {
			answers: res.answers,
			tokens: res.usage?.input_tokens ?? estimateTokens(request),
			model: res.model ?? null
		};
	} catch (err) {
		console.error('decision failed', (err as Error).message);
		return null;
	} finally {
		clearTimeout(waitForAnswer);
	}
}
