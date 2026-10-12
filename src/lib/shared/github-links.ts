const GITHUB = 'https://github.com';
const BOT_SUFFIX = /\[bot\]$/;

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

export const repoUrl = (repo: string) => `${GITHUB}/${repo}`;

export const profileUrl = (login: string, bot = false) =>
	bot ? `${GITHUB}/apps/${login.replace(BOT_SUFFIX, '')}` : `${GITHUB}/${login}`;

export function teamUrl(combinedSlug: string) {
	const [org, team] = combinedSlug.split('/');
	return `${GITHUB}/orgs/${org}/teams/${team}`;
}

export const branchUrl = (repo: string, ref: string) => `${GITHUB}/${repo}/tree/${encodePath(ref)}`;

export const labelUrl = (repo: string, name: string) =>
	`${GITHUB}/${repo}/labels/${encodeURIComponent(name)}`;
