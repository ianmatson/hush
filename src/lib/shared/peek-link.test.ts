import { describe, expect, it } from 'vitest';
import { parsePeekLink, peekLinkUrl } from './peek-link';

describe('parsePeekLink', () => {
	it('reads owner/repo/number and owner/repo#number', () => {
		expect(parsePeekLink('PostHog/posthog/109768')).toEqual({
			repo: 'PostHog/posthog',
			number: 109768
		});
		expect(parsePeekLink('PostHog/posthog.com#20788')).toEqual({
			repo: 'PostHog/posthog.com',
			number: 20788
		});
	});

	it('reads a GitHub pull request or issue URL', () => {
		expect(parsePeekLink('https://github.com/PostHog/posthog/pull/109768/files')).toEqual({
			repo: 'PostHog/posthog',
			number: 109768
		});
		expect(parsePeekLink('github.com/acme/web/issues/7#issuecomment-1')).toEqual({
			repo: 'acme/web',
			number: 7
		});
	});

	it('refuses anything else', () => {
		for (const bad of [
			null,
			'',
			'posthog',
			'PostHog/posthog',
			'a/b/0',
			'a/b/c/1',
			'https://example.com/a/b/pull/1',
			'a b/c/1'
		])
			expect(parsePeekLink(bad)).toBeNull();
	});
});

describe('peekLinkUrl', () => {
	it('links to GitHub, which redirects an issue link to its pull request', () => {
		expect(peekLinkUrl({ repo: 'acme/web', number: 7 })).toBe(
			'https://github.com/acme/web/issues/7'
		);
	});
});
