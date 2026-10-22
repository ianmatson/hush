import type { Attachment } from 'svelte/attachments';
import { on } from 'svelte/events';
import { toast } from 'svelte-sonner';
import { api, ApiError } from '$lib/api';
import { textFingerprint } from '$lib/shared/task-list';

const CONFLICT = 409;

export interface SavedTaskText {
	body: string;
	html: string;
}

interface TaskText {
	id: string;
	markdown: string;
	onsaved: (saved: SavedTaskText) => void;
	onconflict: () => void;
}

const checkboxesIn = (text: HTMLElement) => [
	...text.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
];

export function taskCheckboxes({
	id,
	markdown,
	onsaved,
	onconflict
}: TaskText): Attachment<HTMLElement> {
	return (text) =>
		on(text, 'change', async (e) => {
			const box = e.target;
			if (!(box instanceof HTMLInputElement) || box.type !== 'checkbox') return;
			const boxes = checkboxesIn(text);
			const index = boxes.indexOf(box);
			if (index === -1) return;
			const checked = box.checked;
			for (const b of boxes) b.disabled = true;
			try {
				const fingerprint = await textFingerprint(markdown);
				onsaved(await api.toggleTask({ id, fingerprint, index, count: boxes.length, checked }));
			} catch (err) {
				box.checked = !checked;
				toast.error(`Checkbox: ${(err as Error).message}`);
				if (err instanceof ApiError && err.status === CONFLICT) onconflict();
			} finally {
				for (const b of boxes) b.disabled = false;
			}
		});
}
