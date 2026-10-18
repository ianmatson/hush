import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
	getItem: (key: string) => store.get(key) ?? null,
	setItem: (key: string, value: string) => void store.set(key, value),
	removeItem: (key: string) => void store.delete(key)
});

const { clearSentDraft, loadDraft, saveDraft } = await import('./drafts');

describe('clearSentDraft', () => {
	beforeEach(() => store.clear());

	it('clears the stored draft when it is still the sent text', () => {
		saveDraft('a', 'hello');
		clearSentDraft('a', 'hello');
		expect(loadDraft('a')).toBe('');
	});

	it('keeps text typed after the send', () => {
		saveDraft('a', 'hello again');
		clearSentDraft('a', 'hello');
		expect(loadDraft('a')).toBe('hello again');
	});

	it('leaves other drafts alone', () => {
		saveDraft('a', 'hello');
		saveDraft('b', 'other');
		clearSentDraft('a', 'hello');
		expect(loadDraft('b')).toBe('other');
	});
});
