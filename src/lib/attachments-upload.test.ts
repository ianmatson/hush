import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api';
import { applyTextareaEdit } from '$lib/textarea-edit';
import { Uploads } from '$lib/attachments.svelte';

vi.mock('$lib/api', () => ({ api: { attach: vi.fn() } }));
vi.mock('svelte-sonner', () => ({
	toast: { loading: vi.fn(() => 1), dismiss: vi.fn(), error: vi.fn() }
}));
vi.mock('$lib/textarea-edit', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/textarea-edit')>()),
	applyTextareaEdit: vi.fn((box, edit) => {
		box.value = edit.text;
		box.dispatchEvent(new Event('input'));
	})
}));

function textarea(text: string, caret = text.length) {
	return Object.assign(new EventTarget(), {
		value: text,
		selectionStart: caret,
		selectionEnd: caret,
		isConnected: true
	}) as HTMLTextAreaElement;
}

const image = (name: string) => new File(['image'], name, { type: 'image/png' });
const uploaded = (name: string) => ({ url: `https://example.com/${name}`, kind: 'image' as const });

describe('attachment insertion', () => {
	beforeEach(() => vi.clearAllMocks());

	it('inserts completed images once, in file order, without upload placeholders', async () => {
		const first = Promise.withResolvers<ReturnType<typeof uploaded>>();
		const second = Promise.withResolvers<ReturnType<typeof uploaded>>();
		vi.mocked(api.attach).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
		const box = textarea('before');
		const uploads = new Uploads(() => ({ repo: 'owner/repo', allowed: true }));
		uploads.add(box, [image('one.png'), image('two.png')]);
		expect(box.value).toBe('before');
		expect(uploads.pending).toBe(2);
		second.resolve(uploaded('two.png'));
		first.resolve(uploaded('one.png'));
		await vi.waitFor(() => expect(uploads.pending).toBe(0));
		expect(box.value).toBe(
			'before\n![one.png](https://example.com/one.png)\n![two.png](https://example.com/two.png)\n'
		);
		expect(applyTextareaEdit).toHaveBeenCalledTimes(1);
	});

	it('keeps text typed during upload and tracks the original insertion position', async () => {
		const pending = Promise.withResolvers<ReturnType<typeof uploaded>>();
		vi.mocked(api.attach).mockReturnValueOnce(pending.promise);
		const box = textarea('before after', 7);
		const uploads = new Uploads(() => ({ repo: 'owner/repo', allowed: true }));
		uploads.add(box, [image('one.png')]);
		box.value = 'new before after';
		box.dispatchEvent(new Event('input'));
		pending.resolve(uploaded('one.png'));
		await vi.waitFor(() => expect(uploads.pending).toBe(0));
		expect(box.value).toBe('new before \n![one.png](https://example.com/one.png)\nafter');
	});

	it('keeps the draft unchanged when the upload fails', async () => {
		vi.mocked(api.attach).mockRejectedValueOnce(new Error('Upload failed'));
		const box = textarea('my draft');
		const uploads = new Uploads(() => ({ repo: 'owner/repo', allowed: true }));
		uploads.add(box, [image('one.png')]);
		await vi.waitFor(() => expect(uploads.pending).toBe(0));
		expect(box.value).toBe('my draft');
		expect(applyTextareaEdit).not.toHaveBeenCalled();
	});

	it('does not insert into an editor that closed during upload', async () => {
		const pending = Promise.withResolvers<ReturnType<typeof uploaded>>();
		vi.mocked(api.attach).mockReturnValueOnce(pending.promise);
		const box = textarea('my draft');
		const uploads = new Uploads(() => ({ repo: 'owner/repo', allowed: true }));
		uploads.add(box, [image('one.png')]);
		Object.assign(box, { isConnected: false });
		pending.resolve(uploaded('one.png'));
		await vi.waitFor(() => expect(uploads.pending).toBe(0));
		expect(applyTextareaEdit).not.toHaveBeenCalled();
	});
});
