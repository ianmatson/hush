import { describe, expect, it, vi } from 'vitest';
import type { ItemFieldEdit } from '$lib/shared/item-fields';
import { itemFieldWriteQueue } from './item-field-writes';

const edit = (add: string[], remove: string[], number = 7): ItemFieldEdit => ({
	repo: 'sandbox/web',
	number,
	field: 'labels',
	add,
	remove
});

function deferred() {
	let resolve!: () => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<void>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('item field writes', () => {
	it('sends the edits of one item in order, even when an earlier answer comes late', async () => {
		const answers = [deferred(), deferred()];
		const sent: ItemFieldEdit[] = [];
		const onIdle = vi.fn();
		const write = itemFieldWriteQueue((e) => {
			sent.push(e);
			return answers[sent.length - 1].promise;
		}, onIdle);
		const added = write(edit(['bug'], []));
		const removed = write(edit([], ['bug']));
		await flush();
		expect(sent).toEqual([edit(['bug'], [])]);
		answers[0].resolve();
		await added;
		await flush();
		expect(sent).toEqual([edit(['bug'], []), edit([], ['bug'])]);
		expect(onIdle).not.toHaveBeenCalled();
		answers[1].resolve();
		await removed;
		await flush();
		expect(onIdle).toHaveBeenCalledTimes(1);
	});

	it('keeps going after a refusal and reports it to its caller', async () => {
		const sent: ItemFieldEdit[] = [];
		const onIdle = vi.fn();
		const write = itemFieldWriteQueue(async (e) => {
			sent.push(e);
			if (e.add.includes('bad')) throw new Error('Refused');
		}, onIdle);
		const refused = write(edit(['bad'], []));
		const next = write(edit(['bug'], []));
		await expect(refused).rejects.toThrow('Refused');
		await next;
		await flush();
		expect(sent.map((e) => e.add)).toEqual([['bad'], ['bug']]);
		expect(onIdle).toHaveBeenCalledTimes(1);
	});

	it('does not hold one item behind another', async () => {
		const slow = deferred();
		const sent: number[] = [];
		const write = itemFieldWriteQueue(
			(e) => {
				sent.push(e.number);
				return e.number === 7 ? slow.promise : Promise.resolve();
			},
			() => {}
		);
		void write(edit(['bug'], [], 7));
		await write(edit(['bug'], [], 8));
		expect(sent).toEqual([7, 8]);
		slow.resolve();
	});
});
