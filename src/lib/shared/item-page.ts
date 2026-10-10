import { subjectKind } from './snooze';
import type { DashKind } from './types';

export const ITEM_PATH_SEGMENTS = { pr: 'pull', issue: 'issues' } as const satisfies Record<
	DashKind,
	string
>;

export type ItemPathSegment = (typeof ITEM_PATH_SEGMENTS)[DashKind];

const NAME = /^(?!\.+$)[A-Za-z0-9_.-]{1,100}$/;
const POSITIVE_INTEGER = /^[1-9]\d{0,9}$/;
const GITHUB_ITEM_URL =
	/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/(pull|issues)\/(\d+)(?:[/?#].*)?$/i;

export const isGitHubName = (value: string) => NAME.test(value);

export const isItemPathSegment = (value: string): value is ItemPathSegment =>
	value === ITEM_PATH_SEGMENTS.pr || value === ITEM_PATH_SEGMENTS.issue;

export const isItemNumber = (value: string) => POSITIVE_INTEGER.test(value);

export const FILES_TAB = 'files';

export const isItemTab = (value: string) => value === FILES_TAB;

export function itemPagePath(repo: string, number: number, kind: DashKind): string {
	return `/${repo}/${ITEM_PATH_SEGMENTS[kind]}/${number}`;
}

export function itemPagePathFromGitHubUrl(url: string): string | null {
	const match = GITHUB_ITEM_URL.exec(url.trim());
	if (!match) return null;
	const [, owner, name, segment, number] = match;
	if (!isGitHubName(owner) || !isGitHubName(name) || !isItemNumber(number)) return null;
	const kind = segment.toLowerCase() === ITEM_PATH_SEGMENTS.pr ? 'pr' : 'issue';
	return itemPagePath(`${owner}/${name}`, Number(number), kind);
}
