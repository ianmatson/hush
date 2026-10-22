import { describe, expect, it } from 'vitest';
import { branchRefPath, hushCanDeleteHeadBranch, type HeadBranch } from './head-branch';

const sameRepo: HeadBranch = {
	repo: 'ianmatson/hush',
	head: 'delete-branch',
	headRepo: 'ianmatson/hush',
	defaultBranch: 'main',
	repoDeletesHeadBranches: false
};

describe('hushCanDeleteHeadBranch', () => {
	it('deletes a branch in the same repository', () => {
		expect(hushCanDeleteHeadBranch(sameRepo)).toBe(true);
	});

	it('leaves a branch in a fork alone', () => {
		expect(hushCanDeleteHeadBranch({ ...sameRepo, headRepo: 'someone/hush' })).toBe(false);
		expect(hushCanDeleteHeadBranch({ ...sameRepo, headRepo: null })).toBe(false);
	});

	it('never deletes the default branch', () => {
		expect(hushCanDeleteHeadBranch({ ...sameRepo, head: 'main' })).toBe(false);
	});

	it('leaves it to GitHub when the repository deletes head branches itself', () => {
		expect(hushCanDeleteHeadBranch({ ...sameRepo, repoDeletesHeadBranches: true })).toBe(false);
	});
});

describe('branchRefPath', () => {
	it('keeps the slashes of a branch name and encodes the rest', () => {
		expect(branchRefPath('ianmatson/hush', 'ian/fix#2')).toBe(
			'/repos/ianmatson/hush/git/refs/heads/ian/fix%232'
		);
	});
});
