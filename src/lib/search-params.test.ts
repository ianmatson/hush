import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ replaceState: vi.fn() }));
vi.mock('$app/navigation', () => navigation);
vi.mock('$app/state', () => ({ page: { state: { peek: 'acme/web#1' } } }));

const { takeSearchParams } = await import('./search-params');

describe('takeSearchParams', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		navigation.replaceState.mockClear();
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('reads the params, then takes only them out of the address and keeps the page state', () => {
		vi.stubGlobal('location', {
			href: 'https://app.test/settings/notifications?slack=connected&tab=2#slack'
		});
		expect(takeSearchParams('slack', 'slack_error')).toEqual({
			slack: 'connected',
			slack_error: null
		});
		expect(navigation.replaceState).not.toHaveBeenCalled();

		vi.runAllTimers();
		const [url, state] = navigation.replaceState.mock.calls[0];
		expect(String(url)).toBe('https://app.test/settings/notifications?tab=2#slack');
		expect(state).toEqual({ peek: 'acme/web#1' });
	});

	it('leaves the address alone when none of the params is there', () => {
		vi.stubGlobal('location', { href: 'https://app.test/settings/general' });
		expect(takeSearchParams('token_error')).toEqual({ token_error: null });
		vi.runAllTimers();
		expect(navigation.replaceState).not.toHaveBeenCalled();
	});
});
