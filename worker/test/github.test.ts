import { describe, expect, it } from 'vitest';
import { parseSsoHeader } from '../github';
import { tokenHelp } from '../../src/lib/token-help';
import { vapidFromEnv } from '../webpush';

describe('parseSsoHeader', () => {
	it('reads the org ids GitHub left out', () => {
		expect(parseSsoHeader('partial-results; organizations=21955855,20582480')).toEqual([
			'21955855',
			'20582480'
		]);
		expect(parseSsoHeader(null)).toEqual([]);
		expect(parseSsoHeader('required; url=https://github.com/orgs/x/sso')).toEqual([]);
	});
});

describe('tokenHelp', () => {
	it('explains an org that blocks classic tokens', () => {
		const h = tokenHelp(
			'`PostHog` forbids access via a personal access token (classic). Please use a GitHub App, OAuth App, or a personal access token with fine-grained permissions.'
		);
		expect(h?.title).toBe('PostHog blocks classic tokens');
	});
	it('ignores other errors', () => {
		expect(tokenHelp('Something else')).toBeNull();
	});
});

describe('vapidFromEnv', () => {
	it('uses the app URL when no contact is set', () => {
		const env = { VAPID_PUBLIC_KEY: 'p', VAPID_PRIVATE_KEY: 'k' };
		expect(vapidFromEnv(env, 'https://hush.example').subject).toBe('https://hush.example');
		expect(vapidFromEnv({ ...env, VAPID_SUBJECT: 'mailto:a@b.c' }, 'https://x').subject).toBe(
			'mailto:a@b.c'
		);
	});
});
