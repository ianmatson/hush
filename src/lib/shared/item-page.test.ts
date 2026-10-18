import { describe, expect, it } from 'vitest';
import {
	githubItemUrl,
	isGitHubName,
	isItemNumber,
	isItemPathSegment,
	itemPagePath,
	itemPagePathFromGitHubUrl,
	parseGitHubItemUrl
} from './item-page';

describe('itemPagePath', () => {
	it('uses GitHub paths for pull requests and issues', () => {
		expect(itemPagePath('PostHog/posthog', 123, 'pr')).toBe('/PostHog/posthog/pull/123');
		expect(itemPagePath('PostHog/posthog.com', 7, 'issue')).toBe('/PostHog/posthog.com/issues/7');
	});
});

describe('itemPagePathFromGitHubUrl', () => {
	it('reads pull request and issue links, with or without a deeper path', () => {
		expect(itemPagePathFromGitHubUrl('https://github.com/PostHog/posthog/pull/123')).toBe(
			'/PostHog/posthog/pull/123'
		);
		expect(
			itemPagePathFromGitHubUrl('https://github.com/PostHog/posthog/pull/123/files#diff-abc')
		).toBe('/PostHog/posthog/pull/123');
		expect(
			itemPagePathFromGitHubUrl('https://github.com/PostHog/posthog/issues/9#issuecomment-1')
		).toBe('/PostHog/posthog/issues/9');
	});

	it('refuses other GitHub pages and other hosts', () => {
		expect(itemPagePathFromGitHubUrl('https://github.com/PostHog/posthog/actions/runs/1')).toBe(
			null
		);
		expect(itemPagePathFromGitHubUrl('https://github.com/PostHog/posthog/releases/tag/v1')).toBe(
			null
		);
		expect(itemPagePathFromGitHubUrl('https://example.com/PostHog/posthog/pull/1')).toBe(null);
		expect(itemPagePathFromGitHubUrl('https://github.com/PostHog/../pull/1')).toBe(null);
	});
});

describe('parseGitHubItemUrl', () => {
	it('reads the repository, number, kind, deeper path, and anchor', () => {
		expect(
			parseGitHubItemUrl('https://www.github.com/PostHog/posthog/pull/5/files/#diff-abc')
		).toEqual({
			repo: 'PostHog/posthog',
			number: 5,
			kind: 'pr',
			subpath: ['files'],
			hash: '#diff-abc'
		});
		expect(parseGitHubItemUrl('github.com/acme/web/issues/7')).toMatchObject({
			repo: 'acme/web',
			kind: 'issue'
		});
	});

	it('refuses names and numbers that GitHub does not allow', () => {
		for (const bad of [
			'https://github.com/../web/pull/1',
			'https://github.com/a/.../pull/1',
			'https://github.com/a/b/pull/0',
			'https://github.com/a/b/pull/12345678901',
			'https://github.com/a/b/PULL/1',
			'https://github.com:8443/a/b/pull/1',
			'https://user@github.com/a/b/pull/1',
			'ftp://github.com/a/b/pull/1'
		])
			expect(parseGitHubItemUrl(bad), bad).toBeNull();
	});
});

describe('githubItemUrl', () => {
	it('builds the GitHub address that parseGitHubItemUrl reads back', () => {
		const url = githubItemUrl('PostHog/posthog.com', 42, 'issue');
		expect(url).toBe('https://github.com/PostHog/posthog.com/issues/42');
		expect(parseGitHubItemUrl(url)).toMatchObject({ repo: 'PostHog/posthog.com', number: 42 });
		expect(githubItemUrl('acme/web', 7, 'pr')).toBe('https://github.com/acme/web/pull/7');
	});
});

describe('path parts', () => {
	it('accepts GitHub names, the two kinds, and positive numbers only', () => {
		expect(isGitHubName('posthog.com')).toBe(true);
		expect(isGitHubName('..')).toBe(false);
		expect(isItemPathSegment('pull')).toBe(true);
		expect(isItemPathSegment('issues')).toBe(true);
		expect(isItemPathSegment('pulls')).toBe(false);
		expect(isItemNumber('42')).toBe(true);
		expect(isItemNumber('0')).toBe(false);
		expect(isItemNumber('042')).toBe(false);
	});
});
