import { describe, expect, it } from 'vitest';
import { ciBadge } from './ci-badge';

describe('ciBadge', () => {
	it('says whether the checks pass, fail, or still run', () => {
		expect(ciBadge('SUCCESS')?.label).toBe('Checks pass');
		expect(ciBadge('FAILURE')?.label).toBe('Checks fail');
		expect(ciBadge('ERROR')?.label).toBe('Checks fail');
		expect(ciBadge('PENDING')?.label).toBe('Checks running');
		expect(ciBadge('EXPECTED')?.label).toBe('Checks running');
	});

	it('shows nothing for a PR or issue with no checks', () => {
		expect(ciBadge(null)).toBeNull();
	});
});
