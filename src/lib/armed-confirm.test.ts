import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArmedConfirm } from './armed-confirm.svelte';

describe('ArmedConfirm', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('arms only the key that was pressed', () => {
		const confirm = new ArmedConfirm();
		confirm.arm('acme/web#1:merge');
		expect(confirm.isArmed('acme/web#1:merge')).toBe(true);
		expect(confirm.isArmed('acme/web#2:merge')).toBe(false);
	});

	it('moves to a different key when that one is pressed', () => {
		const confirm = new ArmedConfirm();
		confirm.arm('acme/web#1:merge');
		confirm.arm('acme/web#2:merge');
		expect(confirm.isArmed('acme/web#1:merge')).toBe(false);
		expect(confirm.isArmed('acme/web#2:merge')).toBe(true);
	});

	it('disarms itself after the timeout, counted from the last press', () => {
		const confirm = new ArmedConfirm(1000);
		confirm.arm('a');
		vi.advanceTimersByTime(800);
		confirm.arm('b');
		vi.advanceTimersByTime(800);
		expect(confirm.isArmed('b')).toBe(true);
		vi.advanceTimersByTime(200);
		expect(confirm.armed).toBeNull();
	});

	it('disarms at once on request', () => {
		const confirm = new ArmedConfirm();
		confirm.arm('a');
		confirm.disarm();
		expect(confirm.armed).toBeNull();
		expect(vi.getTimerCount()).toBe(0);
	});

	it('leaves no timer behind when disposed', () => {
		const confirm = new ArmedConfirm();
		confirm.arm('a');
		confirm.dispose();
		expect(vi.getTimerCount()).toBe(0);
	});
});
