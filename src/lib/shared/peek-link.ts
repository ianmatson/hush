export const PEEK_PARAM = 'peek';

export interface PeekLink {
	repo: string;
	number: number;
}

const NAME = '[A-Za-z0-9_.-]+';
const GITHUB_URL = new RegExp(
	`^(?:https?://)?(?:www\\.)?github\\.com/(${NAME}/${NAME})/(?:pull|issues)/(\\d+)(?:[/?#].*)?$`,
	'i'
);
const SHORT_FORM = new RegExp(`^(${NAME}/${NAME})(?:#|/)(\\d+)$`);

export function parsePeekLink(value: string | null): PeekLink | null {
	const text = value?.trim() ?? '';
	const match = GITHUB_URL.exec(text) ?? SHORT_FORM.exec(text);
	if (!match) return null;
	const number = Number(match[2]);
	return Number.isSafeInteger(number) && number > 0 ? { repo: match[1], number } : null;
}

export const peekLinkUrl = ({ repo, number }: PeekLink) =>
	`https://github.com/${repo}/issues/${number}`;
