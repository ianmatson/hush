import { describe, expect, it } from 'vitest';
import { NOW } from '../../src/lib/model/testing';
import type { CommitResult } from '../workspace/commit';
import { WorkspaceStore } from '../workspace/store';
import { configWith, memoryStorage, settingsWith } from './workspace-fixtures';

function resultWith(alerts: CommitResult['alerts']): CommitResult {
	return {
		data: {
			config: configWith(settingsWith([])),
			items: new Map(),
			sources: new Map(),
			views: new Map(),
			revision: 1
		},
		changes: {
			items: new Set(),
			removedItems: new Set(),
			sources: new Set(),
			removedSources: new Set(),
			views: new Set(),
			removedViews: new Set(),
			config: false
		},
		alerts,
		changedViews: [],
		interest: new Set(),
		nextBoundary: null
	};
}

const alert = (id: string, reason: 'ci-failed' | 'review-requested', title: string) => ({
	id,
	itemId: 'PR_1',
	reasons: [reason],
	title,
	body: 'Change 1\nPostHog/posthog',
	url: 'https://github.com/PostHog/posthog/pull/1'
});

describe('WorkspaceStore.exists', () => {
	it('says whether the Workspace tables exist, without creating them', () => {
		const store = new WorkspaceStore(memoryStorage());
		expect(store.exists()).toBe(false);
		expect(store.exists()).toBe(false);
		store.migrate();
		expect(store.exists()).toBe(true);
	});
});

describe('WorkspaceStore alerts', () => {
	it('merges a new cause into the pending alert of the item, and keeps the older one as history', () => {
		const store = new WorkspaceStore(memoryStorage());
		store.migrate();
		store.save(resultWith([alert('a1', 'ci-failed', 'CI failed')]), NOW);
		store.save(resultWith([alert('a2', 'review-requested', 'Review requested')]), NOW + 1);
		expect(store.pendingAlerts()).toMatchObject([
			{
				id: 'a2',
				reasons: ['ci-failed', 'review-requested'],
				title: 'CI failed · Review requested'
			}
		]);
		expect(store.alertHistory(10).find((a) => a.id === 'a1')?.delivery).toEqual({
			status: 'superseded',
			by: 'a2'
		});
	});

	it('ignores the same alert saved twice', () => {
		const store = new WorkspaceStore(memoryStorage());
		store.migrate();
		store.save(resultWith([alert('a1', 'ci-failed', 'CI failed')]), NOW);
		store.save(resultWith([alert('a1', 'ci-failed', 'CI failed')]), NOW);
		expect(store.pendingAlerts()).toHaveLength(1);
	});
});
