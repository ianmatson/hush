import { toHex } from './bytes';
import type { DiffLineTarget, DiffLineSide, ReviewThread } from './diff';
import { FILES_TAB, itemPagePath, parseGitHubItemUrl } from './item-page';

const ABSOLUTE_WEB_URL = /^https?:\/\//i;
const PULL_FILES_PAGES = new Set(['files', 'changes']);
const GITHUB_DIFF_ANCHOR = /^#?diff-([0-9a-f]{64})(?:([LR])(\d+))?(?:-[LR]\d+)?$/i;
const GITHUB_REVIEW_COMMENT_ANCHOR = /^#?r(\d+)$/;
const GITHUB_REVIEW_COMMENT_URL_ANCHOR = /#discussion_r(\d+)$/;

export interface GitHubDiffAnchor {
	fileHash: string;
	line: DiffLineTarget | null;
}

export function parseGitHubDiffAnchor(hash: string): GitHubDiffAnchor | null {
	const match = GITHUB_DIFF_ANCHOR.exec(hash);
	if (!match) return null;
	const [, fileHash, side, line] = match;
	const lineNumber = Number(line);
	return {
		fileHash: fileHash.toLowerCase(),
		line:
			side && Number.isSafeInteger(lineNumber) && lineNumber > 0
				? { side: side.toUpperCase() as DiffLineSide, line: lineNumber }
				: null
	};
}

export function parseReviewCommentAnchor(hash: string): string | null {
	return GITHUB_REVIEW_COMMENT_ANCHOR.exec(hash)?.[1] ?? null;
}

const reviewCommentIdOfUrl = (url: string) =>
	GITHUB_REVIEW_COMMENT_URL_ANCHOR.exec(url)?.[1] ?? null;

function pullFilesPath(itemPath: string, reviewCommentId: string | null): string {
	const filesPath = `${itemPath}/${FILES_TAB}`;
	return reviewCommentId ? `${filesPath}#r${reviewCommentId}` : filesPath;
}

export function reviewThreadPath(repo: string, number: number, thread: ReviewThread): string {
	const rootComment = thread.comments[0];
	return pullFilesPath(
		itemPagePath(repo, number, 'pr'),
		rootComment ? reviewCommentIdOfUrl(rootComment.url) : null
	);
}

export function threadOfReviewComment(
	threads: ReviewThread[],
	commentId: string
): ReviewThread | null {
	return (
		threads.find((thread) =>
			thread.comments.some((comment) => reviewCommentIdOfUrl(comment.url) === commentId)
		) ?? null
	);
}

export async function gitHubDiffFileHash(path: string): Promise<string> {
	return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(path)));
}

export function inAppPathForGitHubUrl(href: string): string | null {
	const text = href.trim();
	const item = ABSOLUTE_WEB_URL.test(text) ? parseGitHubItemUrl(text) : null;
	if (!item) return null;
	const { kind, hash } = item;
	const [page, ...deeper] = item.subpath;
	const itemPath = itemPagePath(item.repo, item.number, kind);
	if (page === undefined) {
		const reviewCommentId = kind === 'pr' ? reviewCommentIdOfUrl(hash) : null;
		return reviewCommentId ? pullFilesPath(itemPath, reviewCommentId) : itemPath;
	}
	if (kind !== 'pr' || deeper.length || !PULL_FILES_PAGES.has(page)) return null;
	const anchor = parseGitHubDiffAnchor(hash) || parseReviewCommentAnchor(hash) ? hash : '';
	return `${itemPath}/${FILES_TAB}${anchor}`;
}
