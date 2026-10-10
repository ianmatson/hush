import { describe, expect, it } from 'vitest';
import { DEFAULT_DASH, expandSections } from './dashboard';
import {
	boardQueryOf,
	lacksProjectScope,
	projectAccessOf,
	statusColor,
	statusName
} from './projects';
import { searchIsUnscoped, sectionsFor } from './item-views';

describe('boardQueryOf', () => {
	it('reads a board when the search names a project and a status', () => {
		expect(
			boardQueryOf('project:PostHog/131 status:"This week","In progress" no:assignee')
		).toEqual({
			owner: 'PostHog',
			number: 131,
			filter: 'status:"This week","In progress" no:assignee'
		});
	});

	it('counts a status that is left out', () => {
		expect(boardQueryOf('is:issue project:acme/7 -status:Done')?.filter).toBe(
			'is:issue -status:Done'
		);
	});

	it('leaves a project search without a status to GitHub search', () => {
		expect(boardQueryOf('project:PostHog/131 is:open')).toBeNull();
		expect(boardQueryOf('repo:acme/web status:success')).toBeNull();
	});
});

describe('expandSections with a board search', () => {
	it('does not add archived:false to the board filter', () => {
		const sections = sectionsFor('issue', [
			{ id: 'board', name: 'Board', searches: ['project:acme/7 status:Todo'], groupBy: 'status' },
			{ id: 'mine', name: 'Mine', searches: ['is:open assignee:@me'], groupBy: 'role' }
		]);
		const { queries } = expandSections(sections, DEFAULT_DASH, []);
		expect(queries.map((q) => q.q)).toEqual([
			'is:issue project:acme/7 status:Todo',
			'is:issue is:open assignee:@me archived:false'
		]);
	});
});

describe('project access', () => {
	it('reads the access from the token scopes', () => {
		expect(projectAccessOf(['repo', 'project'])).toBe('edit');
		expect(projectAccessOf(['repo', 'read:project'])).toBe('read');
		expect(projectAccessOf(['repo', 'notifications'])).toBe('none');
	});

	it('knows the GitHub error for a missing project scope', () => {
		expect(
			lacksProjectScope(
				"Your token has not been granted the required scopes to execute this query. The 'projectV2' field requires one of the following scopes: ['read:project']"
			)
		).toBe(true);
		expect(lacksProjectScope('Could not resolve to a ProjectV2 with the number 9.')).toBe(false);
	});

	it('treats a project as a scope for a search', () => {
		expect(searchIsUnscoped('is:open project:acme/7')).toBe(false);
	});
});

describe('status', () => {
	const status = {
		fieldId: 'F',
		optionId: 'b',
		options: [
			{ id: 'a', name: 'Backlog', color: 'GRAY' },
			{ id: 'b', name: 'This week', color: 'YELLOW' }
		]
	};

	it('names the selected option', () => {
		expect(statusName(status)).toBe('This week');
		expect(statusName({ ...status, optionId: null })).toBeNull();
		expect(statusName(null)).toBeNull();
	});

	it('maps GitHub option colours to mark colours', () => {
		expect(statusColor('YELLOW')).toBe('amber');
		expect(statusColor('PURPLE')).toBe('violet');
		expect(statusColor('UNKNOWN')).toBe('gray');
	});
});
