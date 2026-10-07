import { describe, expect, it } from 'vitest';
import { externalContributor } from './contributors';

describe('externalContributor', () => {
	it('marks authors who are not members or collaborators', () => {
		expect(externalContributor('CONTRIBUTOR', false)).toBe('external');
		expect(externalContributor('NONE', false)).toBe('external');
	});
	it('marks first-time contributors apart', () => {
		expect(externalContributor('FIRST_TIME_CONTRIBUTOR', false)).toBe('first-time');
		expect(externalContributor('FIRST_TIMER', false)).toBe('first-time');
	});
	it('does not mark members, collaborators, owners, or bots', () => {
		expect(externalContributor('MEMBER', false)).toBeNull();
		expect(externalContributor('COLLABORATOR', false)).toBeNull();
		expect(externalContributor('OWNER', false)).toBeNull();
		expect(externalContributor('MANNEQUIN', false)).toBeNull();
		expect(externalContributor('NONE', true)).toBeNull();
	});
	it('does not mark an author whose association is not known', () => {
		expect(externalContributor(undefined, false)).toBeNull();
		expect(externalContributor(null, false)).toBeNull();
	});
});
