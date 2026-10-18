import { githubItemUrl, isGitHubName, isItemNumber, parseGitHubItemUrl } from './item-page';

export const PEEK_PARAM = 'peek';

export interface PeekLink {
	repo: string;
	number: number;
}

const SHORT_FORM = /^([^/#\s]+)\/([^/#\s]+)[#/](\d+)$/;

function parseShortForm(text: string): PeekLink | null {
	const match = SHORT_FORM.exec(text);
	if (!match) return null;
	const [, owner, name, number] = match;
	if (!isGitHubName(owner) || !isGitHubName(name) || !isItemNumber(number)) return null;
	return { repo: `${owner}/${name}`, number: Number(number) };
}

export function parsePeekLink(value: string | null): PeekLink | null {
	const text = value?.trim() ?? '';
	const item = parseGitHubItemUrl(text);
	return item ? { repo: item.repo, number: item.number } : parseShortForm(text);
}

export const peekLinkUrl = ({ repo, number }: PeekLink) => githubItemUrl(repo, number, 'issue');

export const peekLinkParam = ({ repo, number }: PeekLink) => `${repo}/${number}`;
