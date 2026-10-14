import { describe, expect, it } from 'vitest';
import { withProjectStatuses } from '../poller/project-status';
import type { DashItem, DashProject } from '../../src/lib/shared/types';

const previous = {
	items: [
		{ id: 'o/r#1', projectStatus: { 'o/7': 'doing' }, myLastReviewState: null },
		{ id: 'o/r#2', projectStatus: { 'o/7': null } }
	] as DashItem[],
	projects: [{ key: 'o/7', title: 'Website', url: 'u', statuses: [] }] as DashProject[]
};
const items = [{ id: 'o/r#1', myLastReviewState: 'APPROVED' }, { id: 'o/r#2' }] as DashItem[];
const nodeIdOf = (key: string) => (key === 'o/r#1' ? 'PR_1' : 'I_2');

describe('project data on reconstructed dashboards', () => {
	it('preserves a failed item while applying a successful removal to another item', () => {
		const data = withProjectStatuses(
			items,
			nodeIdOf,
			{ projects: [], statusOf: new Map([['PR_1', {}]]) },
			previous
		);
		expect(data.items[0]).toEqual({
			id: 'o/r#1',
			myLastReviewState: 'APPROVED',
			projectStatus: {},
			projectStatusUnknown: false
		});
		expect(data.items[1].projectStatus).toEqual({ 'o/7': null });
		expect(data.projects).toEqual(previous.projects);
	});

	it('keeps project definitions and memberships after a failed full refresh', () => {
		const data = withProjectStatuses(
			items,
			nodeIdOf,
			{ projects: [], statusOf: new Map() },
			previous
		);
		expect(data.items.map((item) => item.projectStatus)).toEqual([
			{ 'o/7': 'doing' },
			{ 'o/7': null }
		]);
		expect(data.items[0].myLastReviewState).toBe('APPROVED');
		expect(data.projects).toEqual(previous.projects);
	});

	it('removes cached project data when project access is absent', () => {
		const data = withProjectStatuses(previous.items, nodeIdOf, null, previous);
		expect(data.items.every((item) => item.projectStatus === undefined)).toBe(true);
		expect(data.projects).toBeUndefined();
	});

	it('marks a first failed membership read as unknown rather than absent', () => {
		const data = withProjectStatuses(items, nodeIdOf, { projects: [], statusOf: new Map() });
		expect(data.items.every((item) => item.projectStatusUnknown)).toBe(true);
	});

	it('trusts visible memberships when a different project is hidden', () => {
		const data = withProjectStatuses(
			items,
			nodeIdOf,
			{
				projects: [],
				statusOf: new Map([['PR_1', { 'o/9': 'done' }]]),
				incomplete: new Set(['PR_1'])
			},
			previous
		);
		expect(data.items[0].projectStatus).toEqual({ 'o/9': 'done' });
		expect(data.items[0].projectStatusUnknown).toBe(false);
	});

	it('removes a visible membership despite a hidden project entry', () => {
		const data = withProjectStatuses(
			items,
			nodeIdOf,
			{
				projects: [],
				statusOf: new Map([['PR_1', {}]]),
				incomplete: new Set(['PR_1'])
			},
			previous
		);
		expect(data.items[0].projectStatus).toEqual({});
		expect(data.items[0].projectStatusUnknown).toBe(false);
	});

	it('removes unused definitions after a complete full build', () => {
		const data = withProjectStatuses(
			items,
			nodeIdOf,
			{
				projects: [],
				statusOf: new Map([
					['PR_1', {}],
					['I_2', {}]
				])
			},
			previous,
			true
		);
		expect(data.projects).toEqual([]);
	});
});
