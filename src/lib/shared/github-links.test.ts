import { describe, expect, it } from 'vitest';
import { branchUrl, labelUrl, profileUrl, repoUrl, teamUrl } from './github-links';

describe('github links', () => {
	it('links a person to their profile', () => {
		expect(profileUrl('octocat')).toBe('https://github.com/octocat');
	});

	it('links a bot to its app page, without the [bot] suffix', () => {
		expect(profileUrl('dependabot[bot]', true)).toBe('https://github.com/apps/dependabot');
		expect(profileUrl('renovate', true)).toBe('https://github.com/apps/renovate');
	});

	it('links a team from its combined slug', () => {
		expect(teamUrl('PostHog/website')).toBe('https://github.com/orgs/PostHog/teams/website');
	});

	it('keeps the slashes of a branch name and encodes the rest', () => {
		expect(branchUrl('PostHog/posthog.com', 'fix/cdp-sources#2')).toBe(
			'https://github.com/PostHog/posthog.com/tree/fix/cdp-sources%232'
		);
	});

	it('encodes a label name', () => {
		expect(labelUrl('PostHog/posthog', 'team/web analytics')).toBe(
			'https://github.com/PostHog/posthog/labels/team%2Fweb%20analytics'
		);
	});

	it('links a repository', () => {
		expect(repoUrl('PostHog/posthog')).toBe('https://github.com/PostHog/posthog');
	});
});
