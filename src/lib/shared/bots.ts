export function isBot(login: string | undefined | null): boolean {
	if (!login) return false;
	return /\[bot\]$/i.test(login) || /^(dependabot|renovate|github-actions|codecov)/i.test(login);
}
