import { describe, expect, it } from 'vitest';
import { toReviewThread, type ThreadNode } from '../routes/diff';

const DIFF_HUNK = ['@@ -0,0 +1,6 @@', '+one', '+two', '+three', '+four', '+five', '+six'].join(
	'\n'
);

const node = (overrides: Partial<ThreadNode>): ThreadNode => ({
	id: 'PRRT_1',
	isResolved: false,
	isOutdated: false,
	path: '.github/workflows/check.yml',
	line: 6,
	startLine: null,
	originalStartLine: null,
	diffSide: 'RIGHT',
	startDiffSide: null,
	subjectType: 'LINE',
	viewerCanReply: true,
	viewerCanResolve: true,
	viewerCanUnresolve: false,
	root: { nodes: [{ diffHunk: DIFF_HUNK, pullRequestReview: { id: 'PRR_1' } }] },
	comments: { totalCount: 0, nodes: [] },
	...overrides
});

describe('toReviewThread', () => {
	it('keeps the review that started the thread, and the last four lines of its hunk', () => {
		const thread = toReviewThread(node({}));
		expect(thread.reviewId).toBe('PRR_1');
		expect(thread.excerpt.map((l) => l.text)).toEqual(['three', 'four', 'five', 'six']);
	});

	it('shows the commented lines of a range, from the lines of the commit it was written on', () => {
		const thread = toReviewThread(
			node({ startLine: 1, originalStartLine: 2, startDiffSide: 'RIGHT', isOutdated: true })
		);
		expect(thread.excerpt.map((l) => l.newLine)).toEqual([2, 3, 4, 5, 6]);
	});

	it('shows no lines for a comment on the whole file', () => {
		expect(toReviewThread(node({ subjectType: 'FILE', line: null })).excerpt).toEqual([]);
	});

	it('has no review and no lines when GitHub gives no first comment', () => {
		const thread = toReviewThread(node({ root: { nodes: [] } }));
		expect(thread.reviewId).toBe(null);
		expect(thread.excerpt).toEqual([]);
	});
});
