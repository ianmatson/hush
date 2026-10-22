import { describe, expect, it } from 'vitest';
import {
	MAX_FIELD_CHANGES,
	canEditItemFields,
	validItemFieldChanges,
	withFieldChange,
	withPendingEdits
} from './item-fields';

describe('item field edits', () => {
	it.each([
		['ADMIN', true],
		['MAINTAIN', true],
		['WRITE', true],
		['TRIAGE', true],
		['READ', false],
		[null, false]
	])('lets %s edit labels and assignees: %s', (permission, allowed) => {
		expect(canEditItemFields(permission)).toBe(allowed);
	});

	it('keeps each value once', () => {
		expect(validItemFieldChanges('labels', ['bug', 'bug'], ['docs'])).toEqual({
			add: ['bug'],
			remove: ['docs']
		});
	});

	it.each([
		['labels', [], []],
		['labels', 'bug', []],
		['labels', [''], []],
		['labels', ['x'.repeat(51)], []],
		['labels', [], ['.']],
		['labels', [], ['..']],
		['labels', Array.from({ length: MAX_FIELD_CHANGES + 1 }, (_, i) => `l${i}`), []],
		['assignees', ['not a login'], []],
		['assignees', [], ['-dash']]
	] as const)('refuses %s change %j / %j', (field, add, remove) => {
		expect(validItemFieldChanges(field, add, remove)).toBeNull();
	});

	it('adds and removes values without case duplicates', () => {
		const labels = [{ name: 'Bug' }, { name: 'docs' }];
		expect(
			withFieldChange(labels, (l) => l.name, {
				add: [{ name: 'bug' }, { name: 'ui' }],
				remove: ['DOCS']
			})
		).toEqual([{ name: 'Bug' }, { name: 'ui' }]);
	});
});

describe('pending label and assignee edits', () => {
	const fetched = {
		labels: [{ name: 'bug', color: 'd73a4a' }],
		assignees: [{ login: 'ada', avatar: null, bot: false }]
	};
	const ui = { name: 'ui', color: 'ededed' };
	const bob = { login: 'bob', avatar: null, bot: false };

	it('shows the edits on top of an older read, in the order they were made', () => {
		const shown = withPendingEdits(fetched, [
			{ id: 1, field: 'labels', on: true, label: ui },
			{ id: 2, field: 'labels', on: false, label: ui },
			{ id: 3, field: 'labels', on: false, label: { name: 'bug', color: '' } },
			{ id: 4, field: 'assignees', on: true, person: bob }
		]);
		expect(shown.labels).toEqual([]);
		expect(shown.assignees.map((a) => a.login)).toEqual(['ada', 'bob']);
	});

	it('keeps an edit that a newer read already shows only once', () => {
		const read = { ...fetched, labels: [...fetched.labels, ui] };
		expect(
			withPendingEdits(read, [{ id: 1, field: 'labels', on: true, label: ui }]).labels
		).toEqual(read.labels);
	});
});
