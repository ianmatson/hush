export type AttachmentKind = 'image' | 'video';

const MB = 1024 * 1024;

export const ATTACHMENT_TYPES = {
	'image/png': 'image',
	'image/jpeg': 'image',
	'image/gif': 'image',
	'image/webp': 'image',
	'image/svg+xml': 'image',
	'video/mp4': 'video',
	'video/quicktime': 'video',
	'video/webm': 'video'
} as const satisfies Record<string, AttachmentKind>;

export type AttachmentType = keyof typeof ATTACHMENT_TYPES;

export const MAX_ATTACHMENT_BYTES: Record<AttachmentKind, number> = {
	image: 10 * MB,
	video: 100 * MB
};

export const MAX_ATTACHMENT_NAME = 255;

export const ATTACHMENT_ACCEPT = Object.keys(ATTACHMENT_TYPES).join(',');

const ATTACHMENT_FORMATS = 'PNG, JPEG, GIF, WebP, SVG, MP4, MOV, and WebM';

const WRITE_PERMISSIONS = new Set(['ADMIN', 'MAINTAIN', 'WRITE']);

export const ATTACH_NEEDS_WRITE =
	'GitHub lets you attach files only in repositories you can push to.';

export function canAttach(permission: string | null): boolean {
	return permission === null || WRITE_PERMISSIONS.has(permission);
}

export function attachmentKind(type: string): AttachmentKind | null {
	return Object.hasOwn(ATTACHMENT_TYPES, type) ? ATTACHMENT_TYPES[type as AttachmentType] : null;
}

export function attachmentProblem(file: {
	name: string;
	type: string;
	size: number;
}): string | null {
	const kind = attachmentKind(file.type);
	if (!kind) return `GitHub accepts only ${ATTACHMENT_FORMATS} files.`;
	if (file.size === 0) return 'The file is empty.';
	const max = MAX_ATTACHMENT_BYTES[kind];
	if (file.size > max) return `The file is larger than ${max / MB} MB.`;
	return null;
}

export function attachmentName(name: string): string {
	const base = name.split(/[\\/]/).pop()?.trim() ?? '';
	return (base || 'attachment').slice(-MAX_ATTACHMENT_NAME);
}

const escapeAlt = (text: string) => text.replace(/[\\[\]]/g, '\\$&');

export function attachmentMarkdown(name: string, url: string, kind: AttachmentKind): string {
	return kind === 'video' ? url : `![${escapeAlt(name)}](${url})`;
}

export function uploadingPlaceholder(text: string, name: string): string {
	const placeholder = (label: string) => `![Uploading ${escapeAlt(label)}…]()`;
	let candidate = placeholder(name);
	for (let n = 2; text.includes(candidate); n++) candidate = placeholder(`${name} (${n})`);
	return candidate;
}

export type TextEdit = { text: string; caret: number };

export function insertBlock(text: string, start: number, end: number, block: string): TextEdit {
	const before = text.slice(0, start);
	const after = text.slice(end);
	const lead = before && !before.endsWith('\n') ? '\n' : '';
	const trail = after.startsWith('\n') ? '' : '\n';
	const inserted = `${lead}${block}${trail}`;
	return { text: before + inserted + after, caret: before.length + inserted.length };
}

export function replaceBlock(
	text: string,
	caret: number,
	block: string,
	replacement: string
): TextEdit | null {
	const at = text.indexOf(block);
	if (at < 0) return null;
	const end = at + block.length;
	const removesLine = !replacement && text[end] === '\n';
	const removed = removesLine ? block.length + 1 : block.length;
	const next = text.slice(0, at) + replacement + text.slice(at + removed);
	const shift = replacement.length - removed;
	const moved = caret >= at + removed ? caret + shift : Math.min(caret, at + replacement.length);
	return { text: next, caret: moved };
}
