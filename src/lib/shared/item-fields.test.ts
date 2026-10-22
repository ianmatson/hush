import { describe, expect, it } from 'vitest';
import {
	MAX_FIELD_CHANGES,
	canEditItemFields,
	validItemFieldChanges,
	withFieldChange
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
