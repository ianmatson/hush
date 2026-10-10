import { createContext } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import { toast } from 'svelte-sonner';
import { api } from '$lib/api';
import {
	ATTACH_NEEDS_WRITE,
	attachmentMarkdown,
	attachmentName,
	attachmentProblem,
	insertBlock,
	replaceBlock,
	uploadingPlaceholder,
	type TextEdit
} from '$lib/shared/attachments';

export type AttachTarget = { repo: string; allowed: boolean };

export const [getAttachTarget, setAttachTarget] = createContext<() => AttachTarget>();

const DROPPING = 'dropping';

export const DROP_TARGET_CLASS =
	'data-dropping:border-ring data-dropping:ring-3 data-dropping:ring-ring/50';

function apply(box: HTMLTextAreaElement, edit: TextEdit) {
	box.value = edit.text;
	box.setSelectionRange(edit.caret, edit.caret);
	box.dispatchEvent(new Event('input', { bubbles: true }));
}

const hasFiles = (data: DataTransfer | null) => !!data?.types.includes('Files');

export class Uploads {
	pending = $state(0);
	readonly #target: () => AttachTarget;

	constructor(target: () => AttachTarget) {
		this.#target = target;
	}

	get allowed() {
		return this.#target().allowed;
	}

	textarea: Attachment<HTMLTextAreaElement> = (box) => {
		const paste = (e: ClipboardEvent) => {
			const files = [...(e.clipboardData?.files ?? [])];
			if (!files.length || e.clipboardData?.getData('text/plain')) return;
			e.preventDefault();
			this.add(box, files);
		};
		const dragOver = (e: DragEvent) => {
			if (!hasFiles(e.dataTransfer)) return;
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
			box.dataset[DROPPING] = '';
		};
		const dragLeave = () => delete box.dataset[DROPPING];
		const drop = (e: DragEvent) => {
			dragLeave();
			if (!hasFiles(e.dataTransfer)) return;
			e.preventDefault();
			box.focus();
			this.add(box, [...(e.dataTransfer?.files ?? [])]);
		};
		box.addEventListener('paste', paste);
		box.addEventListener('dragover', dragOver);
		box.addEventListener('dragleave', dragLeave);
		box.addEventListener('drop', drop);
		return () => {
			box.removeEventListener('paste', paste);
			box.removeEventListener('dragover', dragOver);
			box.removeEventListener('dragleave', dragLeave);
			box.removeEventListener('drop', drop);
		};
	};

	add(box: HTMLTextAreaElement, files: File[]) {
		if (!files.length) return;
		if (!this.allowed)
			return void toast.error('Cannot attach files', { description: ATTACH_NEEDS_WRITE });
		for (const file of files) void this.#upload(box, file);
	}

	async #upload(box: HTMLTextAreaElement, file: File) {
		const name = attachmentName(file.name);
		const problem = attachmentProblem(file);
		if (problem) return void toast.error(`Cannot attach ${name}`, { description: problem });
		const placeholder = uploadingPlaceholder(box.value, name);
		apply(box, insertBlock(box.value, box.selectionStart, box.selectionEnd, placeholder));
		const swap = (replacement: string) => {
			const edit = replaceBlock(box.value, box.selectionStart, placeholder, replacement);
			if (edit) apply(box, edit);
		};
		this.pending++;
		try {
			const { url, kind } = await api.attach(this.#target().repo, file, name);
			swap(attachmentMarkdown(name, url, kind));
		} catch (err) {
			swap('');
			toast.error(`Cannot attach ${name}`, { description: (err as Error).message });
		} finally {
			this.pending--;
		}
	}
}
