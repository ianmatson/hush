import { describe, expect, it } from 'vitest';
import { subjectRefOf, toDTO, viewWhere, type ThreadWithFacts } from '../poller/schema';

describe('viewWhere', () => {
	// SQLite refuses a statement whose bind values do not match its placeholders.
	it.each(['action', 'fyi', 'inbox', 'snoozed', 'done', 'muted', 'all'])(
		'"%s" binds one value for each placeholder',
		(view) => {
			const { where, args } = viewWhere(view, 123);
			expect(where.split('?').length - 1).toBe(args.length);
			expect(args.every((a) => a === 123)).toBe(true);
		}
	);
});

describe('subject keys on threads', () => {
	it('reads owner, repo, and number from the key', () => {
		expect(subjectRefOf({ id: 't', subject_key: 'acme/website#20481' })).toEqual({
			key: 't',
			owner: 'acme',
			repo: 'website',
			number: 20481
		});
		expect(subjectRefOf({ id: 't', subject_key: null })).toBeNull();
	});

	const row = (over: Partial<ThreadWithFacts> = {}): ThreadWithFacts => ({
		id: 't',
		repo: 'o/r',
		subject_type: 'PullRequest',
		subject_key: 'o/r#7',
		title: 'T',
		html_url: 'https://github.com/o/r/pull/7',
		reason: 'review_requested',
		unread: 1,
		gh_updated_at: '2026-09-01T00:00:00Z',
		category: 'action',
		kind: 'review',
		summary: 's',
		why: 'w',
		action_label: 'Review',
		action_url: 'u',
		rule: null,
		triage: 'inbox',
		snoozed_until: null,
		snooze_event: null,
		snoozed_at: null,
		resolved_at: null,
		resolved_note: null,
		marked_unread_at: null,
		pushed_updated_at: null,
		pushed_at: null,
		first_seen_at: 0,
		facts: null,
		...over
	});

	it('a thread shows its number before its subject is read, and its facts after', () => {
		expect(toDTO(row())).toMatchObject({ number: 7, state: null, labels: [] });
		const facts = JSON.stringify({
			state: 'merged',
			draft: false,
			ci: 'SUCCESS',
			author: 'alice',
			authorIsBot: false,
			labels: [{ name: 'website', color: 'fff' }]
		});
		expect(toDTO(row({ facts }))).toMatchObject({
			number: 7,
			state: 'merged',
			ci: 'SUCCESS',
			author: 'alice',
			labels: ['website']
		});
	});
});
