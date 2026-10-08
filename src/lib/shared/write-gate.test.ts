import { describe, expect, it } from 'vitest';
import { gateAllowsRepo, writeGate } from './write-gate';

describe('writeGate', () => {
	it('allows every repository when writes are on', () => {
		expect(gateAllowsRepo(writeGate(undefined, 'a/b'), 'x/y')).toBe(true);
	});

	it('blocks every repository when writes are off and nothing is allowed', () => {
		const gate = writeGate('off', undefined);
		expect(gate.kind).toBe('none');
		expect(gateAllowsRepo(gate, 'a/b')).toBe(false);
	});

	it('allows only the listed repositories, without regard to case', () => {
		const gate = writeGate('off', ' ianmatson/hush-sandbox , bad, also/ok ');
		expect(gateAllowsRepo(gate, 'IanMatson/Hush-Sandbox')).toBe(true);
		expect(gateAllowsRepo(gate, 'also/ok')).toBe(true);
		expect(gateAllowsRepo(gate, 'ianmatson/hush')).toBe(false);
		expect(gateAllowsRepo(gate, null)).toBe(false);
	});
});
