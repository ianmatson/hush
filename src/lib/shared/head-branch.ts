export interface HeadBranch {
	repo: string;
	head: string;
	headRepo: string | null;
	defaultBranch: string;
	repoDeletesHeadBranches: boolean;
}

export const hushCanDeleteHeadBranch = (b: HeadBranch) =>
	b.headRepo === b.repo && b.head !== b.defaultBranch && !b.repoDeletesHeadBranches;

export const branchRefPath = (repo: string, branch: string) =>
	`/repos/${repo}/git/refs/heads/${branch.split('/').map(encodeURIComponent).join('/')}`;
