import { HOUR_MS } from '../shared/durations';
import type { Source, SourceHealth, SourceSpec, SourceWindow } from './types';

export const STALE_SOURCE_LIMIT_MS = HOUR_MS;

export type SourceRead =
	| { outcome: 'ok'; window: SourceWindow }
	| { outcome: 'failed'; error: string }
	| { outcome: 'gone'; error: string };

export const newSource = (spec: SourceSpec): Source => ({
	spec,
	window: null,
	failedSince: null,
	error: null
});

export function applySourceRead(source: Source, read: SourceRead, now: number): Source {
	if (read.outcome === 'ok')
		return { ...source, window: read.window, failedSince: null, error: null };
	if (read.outcome === 'gone')
		return { ...source, window: null, failedSince: null, error: read.error };
	return { ...source, failedSince: source.failedSince ?? now, error: read.error };
}

export const staleUntil = (source: Source) =>
	source.failedSince === null ? null : source.failedSince + STALE_SOURCE_LIMIT_MS;

export function usableWindow(source: Source | undefined, now: number): SourceWindow | null {
	if (!source?.window) return null;
	const until = staleUntil(source);
	return until === null || now < until ? source.window : null;
}

export function sourceHealth(
	source: Source | undefined,
	sourceId: string,
	now: number
): SourceHealth {
	const window = usableWindow(source, now);
	return {
		sourceId,
		stale: !!window && source?.failedSince !== null,
		unknown: !window,
		truncated: !!window?.truncated,
		error: source?.error ?? null
	};
}

export const withSpec = (source: Source | undefined, spec: SourceSpec): Source =>
	source ? { ...source, spec } : newSource(spec);
