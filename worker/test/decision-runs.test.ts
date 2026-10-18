import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecisionAnswers, DecisionRequest } from '../../src/lib/shared/decisions';
import { DEFAULT_SETTINGS } from '../../src/lib/shared/settings';
import type { SubjectFacts } from '../../src/lib/shared/subject';
import type { Decided } from '../decide';
import type { Who } from '../poller/shared';
import { subjectFixture } from './subject-fixtures';

vi.mock('../poller/alerts', () => ({ PollerAlerts: class {} }));
vi.mock('../decide', () => ({
	decide: vi.fn(),
	dailyTokenBudget: () => 1_000_000,
	decisionsAvailable: () => true
}));

const { PollerDecisions } = await import('../poller/decisions');
const { decide } = await import('../decide');
const { SCHEMA } = await import('../poller/schema');

class TestDecisions extends PollerDecisions {
	decideNow(who: Who, subjects: SubjectFacts[]) {
		return this.decideSubjects(who, subjects);
	}
	usage() {
		return this.decisionUsage();
	}
}

const TOKENS_PER_CALL = 100;

function answersTo(request: DecisionRequest): DecisionAnswers {
	return Object.fromEntries(
		Object.entries(request.questions).map(([key, question]) => [
			key,
			question.type === 'score'
				? { type: 'score', score: 0.2 }
				: question.type === 'noul'
					? { type: 'noul', noul: 0.1 }
					: { type: 'choice', choice: Object.keys(question.criteria)[0], confidence: 0.9 }
		])
	);
}

function harness() {
	const db = new DatabaseSync(':memory:');
	db.exec(SCHEMA);
	const values = new Map<string, unknown>();
	const poller = Object.assign(Object.create(TestDecisions.prototype) as TestDecisions, {
		decisionRuns: Promise.resolve(),
		env: {},
		ctx: {
			storage: {
				get: async (key: string) => structuredClone(values.get(key)),
				put: async (key: string, value: unknown) => {
					values.set(key, structuredClone(value));
				}
			}
		},
		all: (query: string, ...args: (string | number | null)[]) => db.prepare(query).all(...args),
		allIn: (query: string, keys: string[]) =>
			keys.length ? db.prepare(query).all(JSON.stringify(keys)) : [],
		run: (query: string, ...args: (string | number | null)[]) =>
			Number(db.prepare(query).run(...args).changes),
		transaction: <T>(action: () => T) => action()
	});
	return { poller };
}

const who: Who = {
	userId: 1,
	me: 'ian',
	token: 'test',
	settings: { ...structuredClone(DEFAULT_SETTINGS), smartDecisions: true },
	projectAccess: 'read'
};

describe('decision runs', () => {
	beforeEach(() => vi.clearAllMocks());

	it('runs one decision at a time, so the same item is decided once and every token counts', async () => {
		const { poller } = harness();
		const answered: (() => void)[] = [];
		vi.mocked(decide).mockImplementation(
			(_env, request) =>
				new Promise<Decided>((resolve) =>
					answered.push(() =>
						resolve({ answers: answersTo(request), tokens: TOKENS_PER_CALL, model: null })
					)
				)
		);
		const first = subjectFixture();
		const second = subjectFixture({ id: 'PR_2', number: 2 });
		const fromAlarm = poller.decideNow(who, [first]);
		const fromPeek = poller.decideNow(who, [first, second]);
		await vi.waitFor(() => expect(answered).toHaveLength(1));
		answered.shift()!();
		await fromAlarm;
		await vi.waitFor(() => expect(answered).toHaveLength(1));
		answered.shift()!();
		await fromPeek;
		expect(decide).toHaveBeenCalledTimes(2);
		expect((await poller.usage()).tokens).toBe(2 * TOKENS_PER_CALL);
		expect((await poller.usage()).calls).toBe(2);
	});

	it('keeps deciding after a run fails', async () => {
		const { poller } = harness();
		vi.mocked(decide)
			.mockRejectedValueOnce(new Error('Workers AI failed'))
			.mockImplementation(async (_env, request) => ({
				answers: answersTo(request),
				tokens: TOKENS_PER_CALL,
				model: null
			}));
		await expect(poller.decideNow(who, [subjectFixture()])).rejects.toThrow('Workers AI failed');
		await poller.decideNow(who, [subjectFixture({ id: 'PR_2', number: 2 })]);
		expect(decide).toHaveBeenCalledTimes(2);
	});
});
