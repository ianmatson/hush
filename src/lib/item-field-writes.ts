import type { ItemFieldEdit } from '$lib/shared/item-fields';
import { subjectKey } from '$lib/shared/subject';

export function itemFieldWriteQueue(
	send: (edit: ItemFieldEdit) => Promise<unknown>,
	onIdle: (edit: ItemFieldEdit) => void
) {
	const tails = new Map<string, Promise<unknown>>();
	const waiting = new Map<string, number>();

	return function write(edit: ItemFieldEdit): Promise<void> {
		const key = subjectKey(edit.repo, edit.number);
		const previous = tails.get(key) ?? Promise.resolve();
		const written = previous.then(() => send(edit));
		const tail = written.catch(() => undefined);
		tails.set(key, tail);
		waiting.set(key, (waiting.get(key) ?? 0) + 1);
		void tail.then(() => {
			const left = (waiting.get(key) ?? 1) - 1;
			if (left) return void waiting.set(key, left);
			waiting.delete(key);
			tails.delete(key);
			onIdle(edit);
		});
		return written.then(() => undefined);
	};
}
