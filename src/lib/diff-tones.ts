import type { DiffLineKind } from '$lib/shared/diff';

export const DIFF_ROW_TONE: Record<DiffLineKind, string> = {
	add: 'bg-signal-merge/10',
	del: 'bg-signal-fail/10',
	context: '',
	note: 'text-muted-foreground italic'
};

export const DIFF_NUMBER_TONE: Record<DiffLineKind, string> = {
	add: 'bg-signal-merge/15',
	del: 'bg-signal-fail/15',
	context: '',
	note: ''
};

export const DIFF_LINE_PREFIX: Record<DiffLineKind, string> = {
	add: '+',
	del: '−',
	context: ' ',
	note: ' '
};
