import { describe, expect, it } from 'vitest';
import { requestedByName, sameLogin } from './logins';

describe('logins', () => {
	it('compares logins without case, and never matches a missing one', () => {
		expect(sameLogin('Ian', 'ian')).toBe(true);
		expect(sameLogin('ian', 'bob')).toBe(false);
		expect(sameLogin(null, 'ian')).toBe(false);
		expect(sameLogin(undefined, undefined)).toBe(false);
	});

	it('finds a review request by name, not through a team', () => {
		expect(requestedByName([{ team: false, name: 'IAN' }], 'ian')).toBe(true);
		expect(requestedByName([{ team: true, name: 'ian' }], 'ian')).toBe(false);
		expect(requestedByName([], 'ian')).toBe(false);
	});
});
