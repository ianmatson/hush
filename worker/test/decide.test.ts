import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	dailyTokenBudget,
	decide,
	decisionsAvailable,
	DEFAULT_DAILY_TOKENS,
	DEFAULT_DECISION_MODEL,
	type DecisionModel
} from '../decide';
import { estimateTokens, type DecisionRequest } from '../../src/lib/shared/decisions';

const request: DecisionRequest = {
	state: {
		title: 'Add rate limits',
		repo: 'acme/web',
		kind: 'pull request',
		author: 'ian',
		labels: [],
		body: '',
		comments: [{ author: 'bob', bot: false, body: 'Thanks!' }],
		newCommentsForYou: [{ author: 'bob', body: 'Thanks!' }],
		you: { login: 'ian', roles: ['author'] }
	},
	questions: { reply: { type: 'noul', instructions: 'Does bob ask ian for something?' } }
};

const model = (run: DecisionModel['run']): DecisionModel => ({ run });

afterEach(() => vi.useRealTimers());

describe('decide', () => {
	it('calls Jev with the request and returns its answers and token count', async () => {
		const run = vi.fn(async () => ({
			model: 'jev-1.13.0',
			answers: { reply: { type: 'noul', noul: 0.04 } },
			usage: { input_tokens: 321, output_tokens: 20 }
		}));
		const out = await decide({ AI: model(run) }, request);
		expect(run).toHaveBeenCalledWith(DEFAULT_DECISION_MODEL, request, expect.anything());
		expect(out).toEqual({
			answers: { reply: { type: 'noul', noul: 0.04 } },
			tokens: 321,
			model: 'jev-1.13.0'
		});
	});
	it('reads answers that come inside a completed result', async () => {
		const run = vi.fn(async () => ({
			state: 'Completed',
			result: {
				model: 'jev-1.13.0',
				answers: { reply: { type: 'noul', noul: 0.04 } },
				usage: { input_tokens: 321 }
			}
		}));
		expect(await decide({ AI: model(run) }, request)).toEqual({
			answers: { reply: { type: 'noul', noul: 0.04 } },
			tokens: 321,
			model: 'jev-1.13.0'
		});
	});
	it('estimates the tokens when Jev does not report them', async () => {
		const out = await decide(
			{ AI: model(async () => ({ answers: { reply: { type: 'noul', noul: 0.9 } } })) },
			request
		);
		expect(out?.tokens).toBe(estimateTokens(request));
	});
	it('uses the configured model', async () => {
		const run = vi.fn(async () => ({ answers: {} }));
		await decide({ AI: model(run), DECISION_MODEL: 'typesafe/jev-preview' }, request);
		expect(run).toHaveBeenCalledWith('typesafe/jev-preview', request, expect.anything());
	});
	it('returns null on an error or an answer without answers', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const failing = model(async () => {
			throw new Error('3040: out of capacity');
		});
		expect(await decide({ AI: failing }, request)).toBeNull();
		expect(await decide({ AI: model(async () => ({})) }, request)).toBeNull();
		expect(await decide({}, request)).toBeNull();
	});
	it('gives up after its wait, and leaves no timer behind', async () => {
		vi.useFakeTimers();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const hanging = model(
			(_m, _i, opts) =>
				new Promise((_, reject) =>
					opts?.signal?.addEventListener('abort', () => reject(opts.signal!.reason))
				)
		);
		const pending = decide({ AI: hanging }, request);
		await vi.runAllTimersAsync();
		expect(await pending).toBeNull();
		expect(vi.getTimerCount()).toBe(0);
	});
	it('clears its timer when Jev answers', async () => {
		vi.useFakeTimers();
		await decide({ AI: model(async () => ({ answers: {} })) }, request);
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe('decision settings', () => {
	it('needs the AI binding, and stops with DECISIONS=off', () => {
		const AI = model(async () => ({}));
		expect(decisionsAvailable({ AI })).toBe(true);
		expect(decisionsAvailable({ AI, DECISIONS: 'off' })).toBe(false);
		expect(decisionsAvailable({})).toBe(false);
	});
	it('reads the daily token budget, with a default', () => {
		expect(dailyTokenBudget({})).toBe(DEFAULT_DAILY_TOKENS);
		expect(dailyTokenBudget({ DECISION_DAILY_TOKENS: '50000' })).toBe(50_000);
		expect(dailyTokenBudget({ DECISION_DAILY_TOKENS: 'lots' })).toBe(DEFAULT_DAILY_TOKENS);
	});
});
