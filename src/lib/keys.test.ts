import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { keyActivatesFocusedControl } from './keys.svelte';

class FakeElement {
	constructor(private readonly selectorItMatches: string | null) {}
	matches(selectors: string) {
		return (
			this.selectorItMatches !== null && selectors.split(', ').includes(this.selectorItMatches)
		);
	}
}

const pressOn = (key: string, target: unknown) => ({ key, target }) as unknown as KeyboardEvent;

describe('keyActivatesFocusedControl', () => {
	beforeAll(() => vi.stubGlobal('Element', FakeElement));
	afterAll(() => vi.unstubAllGlobals());

	it('leaves Space and Enter to a focused button, link, or interactive role', () => {
		for (const selector of ['button', 'a[href]', '[role="checkbox"]', '[role="menuitem"]']) {
			expect(keyActivatesFocusedControl(pressOn(' ', new FakeElement(selector)))).toBe(true);
			expect(keyActivatesFocusedControl(pressOn('Enter', new FakeElement(selector)))).toBe(true);
		}
	});

	it('keeps row shortcuts on a focused row or the page', () => {
		expect(keyActivatesFocusedControl(pressOn(' ', new FakeElement('[role="option"]')))).toBe(
			false
		);
		expect(keyActivatesFocusedControl(pressOn('Enter', new FakeElement(null)))).toBe(false);
		expect(keyActivatesFocusedControl(pressOn(' ', null))).toBe(false);
	});

	it('keeps other shortcuts on a focused control', () => {
		expect(keyActivatesFocusedControl(pressOn('j', new FakeElement('button')))).toBe(false);
		expect(keyActivatesFocusedControl(pressOn('e', new FakeElement('a[href]')))).toBe(false);
	});
});
