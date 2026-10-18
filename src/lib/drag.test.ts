import { afterEach, describe, expect, it, vi } from 'vitest';

const { ListDrag } = await import('./drag.svelte');

function fakeWindow() {
	const listeners = new Map<string, Set<EventListener>>();
	return {
		listeners,
		addEventListener: vi.fn((type: string, fn: EventListener) => {
			if (!listeners.has(type)) listeners.set(type, new Set());
			listeners.get(type)!.add(fn);
		}),
		removeEventListener: vi.fn((type: string, fn: EventListener) => {
			listeners.get(type)?.delete(fn);
		})
	};
}

const live = (win: ReturnType<typeof fakeWindow>) =>
	[...win.listeners.values()].reduce((sum, set) => sum + set.size, 0);

function press() {
	return {
		pointerType: 'mouse',
		button: 0,
		clientX: 10,
		clientY: 10,
		pointerId: 1,
		target: { closest: () => null }
	} as unknown as PointerEvent;
}

describe('ListDrag', () => {
	afterEach(() => vi.unstubAllGlobals());

	function dragOf() {
		const win = fakeWindow();
		vi.stubGlobal('window', win);
		vi.stubGlobal('cancelAnimationFrame', vi.fn());
		const drag = new ListDrag({
			enabled: () => true,
			pick: (id) => [id],
			isCollapsed: () => false,
			drop: vi.fn()
		});
		return { win, drag };
	}

	it('removes the listeners of a press when it is disposed', () => {
		const { win, drag } = dragOf();
		drag.pointerdown(press(), 'a', {} as HTMLElement);
		expect(live(win)).toBe(3);

		drag.dispose();
		expect(live(win)).toBe(0);
	});

	it('ignores presses after it is disposed', () => {
		const { win, drag } = dragOf();
		drag.dispose();
		drag.pointerdown(press(), 'a', {} as HTMLElement);
		expect(live(win)).toBe(0);
	});
});
