import { describe, expect, it } from 'vitest';
import { MINUTE_MS } from '../shared/durations';
import {
	applySourceRead,
	newSource,
	sourceHealth,
	STALE_SOURCE_LIMIT_MS,
	usableWindow,
	withSpec
} from './sources';
import { NOW } from './testing';
import type { SourceSpec, SourceWindow } from './types';

const spec: SourceSpec = { id: 's1', adapter: 'search', kind: 'pr', query: 'is:pr is:open' };
const windowOf = (ids: string[], truncated = false): SourceWindow => ({
	candidates: ids.map((id) => ({ id, updatedAt: new Date(NOW).toISOString() })),
	truncated
});

describe('source windows', () => {
	it('replaces the window on success, also when GitHub returned a full page of 100', () => {
		const first = applySourceRead(
			newSource(spec),
			{ outcome: 'ok', window: windowOf(['A', 'B']) },
			NOW
		);
		const hundred = Array.from({ length: 100 }, (_, i) => `N${i}`);
		const next = applySourceRead(first, { outcome: 'ok', window: windowOf(hundred, true) }, NOW);
		expect(usableWindow(next, NOW)?.candidates.map((c) => c.id)).toEqual(hundred);
		expect(sourceHealth(next, spec.id, NOW)).toMatchObject({ truncated: true, stale: false });
	});

	it('keeps the last good window for at most an hour after failures, marked stale', () => {
		const good = applySourceRead(newSource(spec), { outcome: 'ok', window: windowOf(['A']) }, NOW);
		const failed = applySourceRead(good, { outcome: 'failed', error: 'timeout' }, NOW);
		const failedAgain = applySourceRead(
			failed,
			{ outcome: 'failed', error: 'timeout' },
			NOW + 30 * MINUTE_MS
		);
		expect(failedAgain.failedSince).toBe(NOW);
		expect(usableWindow(failedAgain, NOW + 59 * MINUTE_MS)).not.toBeNull();
		expect(sourceHealth(failedAgain, spec.id, NOW + 59 * MINUTE_MS)).toMatchObject({ stale: true });
		expect(usableWindow(failedAgain, NOW + STALE_SOURCE_LIMIT_MS)).toBeNull();
		expect(sourceHealth(failedAgain, spec.id, NOW + STALE_SOURCE_LIMIT_MS)).toMatchObject({
			unknown: true
		});
	});

	it('drops the window at once when the source is gone', () => {
		const good = applySourceRead(newSource(spec), { outcome: 'ok', window: windowOf(['A']) }, NOW);
		expect(
			usableWindow(applySourceRead(good, { outcome: 'gone', error: 'not found' }, NOW), NOW)
		).toBeNull();
	});

	it('treats a source that never ran as unknown, not empty', () => {
		expect(sourceHealth(newSource(spec), spec.id, NOW)).toMatchObject({
			unknown: true,
			stale: false
		});
	});

	it('keeps the window when only the query that runs changes', () => {
		const good = applySourceRead(newSource(spec), { outcome: 'ok', window: windowOf(['A']) }, NOW);
		const rolled = withSpec(good, { ...spec, query: 'is:pr is:open updated:>2026-10-16' });
		expect(usableWindow(rolled, NOW)?.candidates).toHaveLength(1);
	});
});
