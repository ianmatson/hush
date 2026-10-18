import { describe, expect, it } from 'vitest';
import { ciFailing, ciFinished, ciPassing, ciRunning, ciWord } from './ci';

describe('CI states', () => {
	it('reads each GitHub state as passed, failed, or running', () => {
		expect(ciWord('SUCCESS')).toBe('success');
		expect(ciWord('FAILURE')).toBe('failure');
		expect(ciWord('ERROR')).toBe('failure');
		expect(ciWord('PENDING')).toBe('pending');
		expect(ciWord('EXPECTED')).toBe('pending');
		expect(ciWord(null)).toBeNull();
	});

	it('says whether CI passed, failed, runs, or finished', () => {
		expect(ciPassing('SUCCESS')).toBe(true);
		expect(ciFailing('ERROR')).toBe(true);
		expect(ciRunning('EXPECTED')).toBe(true);
		expect(ciFinished('FAILURE')).toBe(true);
		expect(ciFinished('PENDING')).toBe(false);
		expect(ciFinished(null)).toBe(false);
	});
});
