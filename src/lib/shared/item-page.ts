import type { DashKind } from './types';

export const ITEM_PATH_SEGMENTS = { pr: 'pull', issue: 'issues' } as const satisfies Record<
	DashKind,
	string
>;

export type ItemPathSegment = (typeof ITEM_PATH_SEGMENTS)[DashKind];

const NAME = /^(?!\.+$)[A-Za-z0-9_.-]{1,100}$/;
const NODE_ID = /^[A-Za-z0-9_=-]{1,120}$/;
const POSITIVE_INTEGER = /^[1-9]\d{0,9}$/;
const GITHUB_ORIGIN = 'https://github.com';
const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);
const WEB_PROTOCOLS = new Set(['https:', 'http:']);
const HAS_PROTOCOL = /^[a-z][a-z\d+.-]*:/i;

export const isGitHubName = (value: string | undefined): value is string =>
	!!value && NAME.test(value);

export const isNodeId = (value: unknown): value is string =>
	typeof value === 'string' && NODE_ID.test(value);

export interface RepoFullName {
	owner: string;
	name: string;
}

export function parseRepoFullName(value: unknown): RepoFullName | null {
	if (typeof value !== 'string') return null;
	const [owner, name, extra] = value.split('/');
	return isGitHubName(owner) && isGitHubName(name) && extra === undefined ? { owner, name } : null;
}

export const isDashKind = (value: unknown): value is DashKind =>
	value === 'pr' || value === 'issue';

export const isItemPathSegment = (value: string): value is ItemPathSegment =>
	value === ITEM_PATH_SEGMENTS.pr || value === ITEM_PATH_SEGMENTS.issue;

export const kindOfItemSegment = (segment: string | undefined): DashKind | null =>
	segment === ITEM_PATH_SEGMENTS.pr ? 'pr' : segment === ITEM_PATH_SEGMENTS.issue ? 'issue' : null;

export const isItemNumber = (value: string | undefined): value is string =>
	!!value && POSITIVE_INTEGER.test(value);

export const FILES_TAB = 'files';

export const isItemTab = (value: string) => value === FILES_TAB;

export function itemPagePath(repo: string, number: number, kind: DashKind): string {
	return `/${repo}/${ITEM_PATH_SEGMENTS[kind]}/${number}`;
}

export const githubItemUrl = (repo: string, number: number, kind: DashKind) =>
	`${GITHUB_ORIGIN}${itemPagePath(repo, number, kind)}`;

export interface GitHubItemUrl {
	repo: string;
	number: number;
	kind: DashKind;
	subpath: string[];
	hash: string;
}

function gitHubUrlOf(text: string): URL | null {
	try {
		const url = new URL(HAS_PROTOCOL.test(text) ? text : `https://${text}`);
		const onGitHub =
			WEB_PROTOCOLS.has(url.protocol) &&
			GITHUB_HOSTS.has(url.hostname) &&
			!url.port &&
			!url.username &&
			!url.password;
		return onGitHub ? url : null;
	} catch {
		return null;
	}
}

export function parseGitHubItemUrl(text: string): GitHubItemUrl | null {
	const url = gitHubUrlOf(text.trim());
	if (!url) return null;
	const [owner, name, segment, number, ...subpath] = url.pathname
		.replace(/\/+$/, '')
		.split('/')
		.slice(1);
	const kind = kindOfItemSegment(segment);
	if (!kind || !isGitHubName(owner) || !isGitHubName(name) || !isItemNumber(number)) return null;
	return { repo: `${owner}/${name}`, number: Number(number), kind, subpath, hash: url.hash };
}

export function itemPagePathFromGitHubUrl(url: string): string | null {
	const item = parseGitHubItemUrl(url);
	return item && itemPagePath(item.repo, item.number, item.kind);
}
