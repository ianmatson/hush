import { describe, expect, it } from 'vitest';
import {
	isGitHubName,
	isItemNumber,
	isItemPathSegment,
	itemPagePath,
	itemPagePathFromGitHubUrl
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
