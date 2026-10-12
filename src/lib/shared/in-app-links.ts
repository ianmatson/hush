import type { DiffLineTarget, DiffLineSide } from './diff';
import {
	FILES_TAB,
	ITEM_PATH_SEGMENTS,
	isGitHubName,
	isItemNumber,
	itemPagePath
} from './item-page';
import type { DashKind } from './types';

const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);
const WEB_PROTOCOLS = new Set(['https:', 'http:']);
const PULL_FILES_PAGES = new Set(['files', 'changes']);
const GITHUB_DIFF_ANCHOR = /^#?diff-([0-9a-f]{64})(?:([LR])(\d+))?(?:-[LR]\d+)?$/i;

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

export async function gitHubDiffFileHash(path: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(path));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function kindOfSegment(segment: string | undefined): DashKind | null {
	if (segment === ITEM_PATH_SEGMENTS.pr) return 'pr';
	if (segment === ITEM_PATH_SEGMENTS.issue) return 'issue';
	return null;
}

function parseGitHubUrl(href: string): URL | null {
	try {
		const url = new URL(href);
		const onGitHub =
			WEB_PROTOCOLS.has(url.protocol) &&
			GITHUB_HOSTS.has(url.hostname.toLowerCase()) &&
			!url.port &&
			!url.username;
		return onGitHub ? url : null;
	} catch {
		return null;
	}
}

export function inAppPathForGitHubUrl(href: string): string | null {
	const url = parseGitHubUrl(href.trim());
	if (!url) return null;
	const [owner, repo, segment, number, page, ...deeper] = url.pathname
		.replace(/\/+$/, '')
		.split('/')
		.slice(1);
	const kind = kindOfSegment(segment);
	if (!kind || !isGitHubName(owner) || !isGitHubName(repo) || !isItemNumber(number)) return null;
	const itemPath = itemPagePath(`${owner}/${repo}`, Number(number), kind);
	if (page === undefined) return itemPath;
	if (kind !== 'pr' || deeper.length || !PULL_FILES_PAGES.has(page)) return null;
	const anchor = parseGitHubDiffAnchor(url.hash) ? url.hash : '';
	return `${itemPath}/${FILES_TAB}${anchor}`;
}
