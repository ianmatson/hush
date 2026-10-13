import { describe, expect, it } from 'vitest';
import type { ReviewThread, ThreadComment } from './diff';
import {
	gitHubDiffFileHash,
	inAppPathForGitHubUrl,
	parseGitHubDiffAnchor,
	parseReviewCommentAnchor,
	reviewThreadPath,
	threadOfReviewComment
} from './in-app-links';

const HTML_TS_HASH = 'b934ed0e2158893600cafa90b29f357278994ff00a941f29f2438df7a849c83e';

describe('inAppPathForGitHubUrl', () => {
	it('opens pull requests and issues on their Hush page', () => {
		expect(inAppPathForGitHubUrl('https://github.com/PostHog/posthog/pull/123')).toBe(
			'/PostHog/posthog/pull/123'
		);
		expect(inAppPathForGitHubUrl('https://github.com/PostHog/posthog.com/issues/7')).toBe(
			'/PostHog/posthog.com/issues/7'
		);
		expect(inAppPathForGitHubUrl('https://www.github.com/PostHog/posthog/pull/123/')).toBe(
			'/PostHog/posthog/pull/123'
		);
	});

	it('drops comment and review anchors, which the Hush page does not have', () => {
		expect(
			inAppPathForGitHubUrl('https://github.com/PostHog/posthog/issues/9#issuecomment-123')
		).toBe('/PostHog/posthog/issues/9');
		expect(
			inAppPathForGitHubUrl('https://github.com/PostHog/posthog/pull/9#pullrequestreview-456')
		).toBe('/PostHog/posthog/pull/9');
		expect(
			inAppPathForGitHubUrl('https://github.com/PostHog/posthog/issues/9#discussion_r456')
		).toBe('/PostHog/posthog/issues/9');
	});

	it('opens a review comment at its thread in the Files tab', () => {
		expect(inAppPathForGitHubUrl('https://github.com/PostHog/posthog/pull/9#discussion_r456')).toBe(
			'/PostHog/posthog/pull/9/files#r456'
		);
		expect(inAppPathForGitHubUrl('https://github.com/PostHog/posthog/pull/9/files#r456')).toBe(
			'/PostHog/posthog/pull/9/files#r456'
		);
	});

	it('opens the files and changes pages of a pull request on the Files tab', () => {
		expect(inAppPathForGitHubUrl('https://github.com/PostHog/posthog/pull/5/files')).toBe(
			'/PostHog/posthog/pull/5/files'
		);
		expect(inAppPathForGitHubUrl('https://github.com/PostHog/posthog/pull/5/changes')).toBe(
			'/PostHog/posthog/pull/5/files'
		);
	});

	it('keeps a diff anchor so that the Files tab can go to the file and line', () => {
		expect(
			inAppPathForGitHubUrl(
				`https://github.com/PostHog/posthog/pull/5/files#diff-${HTML_TS_HASH}R12`
			)
		).toBe(`/PostHog/posthog/pull/5/files#diff-${HTML_TS_HASH}R12`);
		expect(
			inAppPathForGitHubUrl(
				`https://github.com/PostHog/posthog/pull/5/changes#diff-${HTML_TS_HASH}`
			)
		).toBe(`/PostHog/posthog/pull/5/files#diff-${HTML_TS_HASH}`);
		expect(
			inAppPathForGitHubUrl('https://github.com/PostHog/posthog/pull/5/files#issuecomment-1')
		).toBe('/PostHog/posthog/pull/5/files');
	});

	it('leaves pages that Hush cannot show on GitHub', () => {
		const onGitHub = [
			'https://github.com/PostHog/posthog/pull/5/commits',
			'https://github.com/PostHog/posthog/pull/5/commits/abc123',
			'https://github.com/PostHog/posthog/pull/5/files/abc..def',
			'https://github.com/PostHog/posthog/pull/5/checks',
			'https://github.com/PostHog/posthog/issues/5/files',
			'https://github.com/PostHog/posthog/issues',
			'https://github.com/PostHog/posthog/blob/main/README.md',
			'https://github.com/PostHog/posthog/commit/abc123',
			'https://github.com/PostHog/posthog/labels/bug',
			'https://github.com/PostHog/posthog',
			'https://github.com/octocat',
			'https://github.com/PostHog/posthog/pull/0',
			'https://github.com/PostHog/../pull/1',
			'https://example.com/PostHog/posthog/pull/1',
			'https://github.com:8443/PostHog/posthog/pull/1',
			'javascript:alert(1)',
			'/PostHog/posthog/pull/1',
			'#diff-abc',
			''
		];
		for (const href of onGitHub) expect(inAppPathForGitHubUrl(href), href).toBe(null);
	});
});

describe('parseGitHubDiffAnchor', () => {
	it('reads the file hash and the line of a diff anchor', () => {
		expect(parseGitHubDiffAnchor(`#diff-${HTML_TS_HASH}R12`)).toEqual({
			fileHash: HTML_TS_HASH,
			line: { side: 'R', line: 12 }
		});
		expect(parseGitHubDiffAnchor(`diff-${HTML_TS_HASH}L3`)).toEqual({
			fileHash: HTML_TS_HASH,
			line: { side: 'L', line: 3 }
		});
	});

	it('uses the first line of a range, and no line for a file anchor', () => {
		expect(parseGitHubDiffAnchor(`diff-${HTML_TS_HASH}R12-R20`)?.line).toEqual({
			side: 'R',
			line: 12
		});
		expect(parseGitHubDiffAnchor(`diff-${HTML_TS_HASH}`)).toEqual({
			fileHash: HTML_TS_HASH,
			line: null
		});
	});

	it('refuses other anchors', () => {
		expect(parseGitHubDiffAnchor('file-srcapp.ts')).toBe(null);
		expect(parseGitHubDiffAnchor('diff-abc123R4')).toBe(null);
		expect(parseGitHubDiffAnchor('issuecomment-1')).toBe(null);
	});
});

describe('gitHubDiffFileHash', () => {
	it('is the SHA-256 of the path, as in GitHub diff anchors', async () => {
		expect(await gitHubDiffFileHash('src/lib/html.ts')).toBe(HTML_TS_HASH);
	});
});

const comment = (url: string): ThreadComment => ({
	id: url,
	author: { login: 'ann', avatar: null },
	html: '',
	body: '',
	at: '2026-10-13T10:00:00Z',
	url,
	pending: false,
	canEdit: false,
	canDelete: false
});

const thread = (id: string, commentIds: number[]): ReviewThread => ({
	id,
	reviewId: 'PRR_1',
	path: 'src/app.ts',
	line: 2,
	startLine: null,
	side: 'RIGHT',
	outdated: false,
	resolved: false,
	fileLevel: false,
	canReply: true,
	canResolve: true,
	canUnresolve: false,
	excerpt: [],
	comments: commentIds.map((n) => comment(`https://github.com/o/r/pull/2#discussion_r${n}`)),
	totalComments: commentIds.length
});

describe('parseReviewCommentAnchor', () => {
	it('reads the comment ID of a Files tab anchor, as on GitHub', () => {
		expect(parseReviewCommentAnchor('#r4263581791')).toBe('4263581791');
		expect(parseReviewCommentAnchor('r12')).toBe('12');
	});

	it('refuses other anchors', () => {
		for (const hash of ['r', '#r12a', 'discussion_r12', `diff-${HTML_TS_HASH}R12`, 'file-a.ts'])
			expect(parseReviewCommentAnchor(hash), hash).toBe(null);
	});
});

describe('reviewThreadPath', () => {
	it('opens the Files tab at the first comment of the thread', () => {
		expect(reviewThreadPath('o/r', 2, thread('PRRT_1', [11, 12]))).toBe('/o/r/pull/2/files#r11');
	});

	it('opens the Files tab when the thread has no comment to go to', () => {
		expect(reviewThreadPath('o/r', 2, thread('PRRT_1', []))).toBe('/o/r/pull/2/files');
	});
});

describe('threadOfReviewComment', () => {
	const threads = [thread('PRRT_1', [11, 12]), thread('PRRT_2', [21])];

	it('finds the thread of a first comment or of a reply', () => {
		expect(threadOfReviewComment(threads, '21')?.id).toBe('PRRT_2');
		expect(threadOfReviewComment(threads, '12')?.id).toBe('PRRT_1');
	});

	it('finds nothing for a comment that is not in a thread', () => {
		expect(threadOfReviewComment(threads, '1')).toBe(null);
	});
});
