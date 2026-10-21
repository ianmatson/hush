import { createContext } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import { toast } from 'svelte-sonner';
import { api } from '$lib/api';
import {
	ATTACH_NEEDS_WRITE,
	attachmentMarkdown,
	attachmentName,
	attachmentProblem,
	insertBlock
} from '$lib/shared/attachments';
import { applyTextareaEdit, trackTextareaSelection } from '$lib/textarea-edit';

export type AttachTarget = { repo: string; allowed: boolean };

export const [getAttachTarget, setAttachTarget] = createContext<() => AttachTarget>();

const DROPPING = 'dropping';

export const DROP_TARGET_CLASS =
	'data-dropping:border-ring data-dropping:ring-3 data-dropping:ring-ring/50';

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
		void this.#insert(box, files);
	}

	async #insert(box: HTMLTextAreaElement, files: File[]) {
		const selection = trackTextareaSelection(box);
		const progress = toast.loading(
			files.length === 1 ? 'Uploading attachment…' : `Uploading ${files.length} attachments…`
		);
		this.pending += files.length;
		try {
			const blocks = await Promise.all(files.map((file) => this.#upload(file)));
			const markdown = blocks.filter((block) => block !== null).join('\n');
			if (!markdown || !box.isConnected) return;
			const { start, end } = selection.range;
			applyTextareaEdit(box, insertBlock(box.value, start, end, markdown));
		} finally {
			selection.destroy();
			toast.dismiss(progress);
			this.pending -= files.length;
		}
	}

	async #upload(file: File): Promise<string | null> {
		const name = attachmentName(file.name);
		const problem = attachmentProblem(file);
		if (problem) {
			toast.error(`Cannot attach ${name}`, { description: problem });
			return null;
		}
		try {
			const { url, kind } = await api.attach(this.#target().repo, file, name);
			return attachmentMarkdown(name, url, kind);
		} catch (err) {
			toast.error(`Cannot attach ${name}`, { description: (err as Error).message });
			return null;
		}
	}
}
