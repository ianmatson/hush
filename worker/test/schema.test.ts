import { describe, expect, it } from 'vitest';
import { snapshotOf } from '../../src/lib/shared/changes';
import type { SubjectFacts } from '../../src/lib/shared/subject';
import { subjectRefOf, toDTO, viewWhere, type ItemWithFacts } from '../poller/schema';

describe('viewWhere', () => {
	// SQLite refuses a statement whose bind values do not match its placeholders.
	it.each(['turn', 'waiting', 'updates', 'snoozed', 'done', 'muted', 'all'] as const)(
		'"%s" binds one value for each placeholder',
		(view) => {
			const { where, args } = viewWhere(view, 123);
			expect(where.split('?').length - 1).toBe(args.length);
		}
	);
});

const facts = (over: Partial<SubjectFacts> = {}): SubjectFacts => ({
	id: 'x',
	kind: 'pr',
	repo: 'o/r',
	number: 7,
	title: 'Fresh title',
	url: 'https://github.com/o/r/pull/7',
	author: 'alice',
	authorAvatar: null,
	authorIsBot: false,
	createdAt: '2026-09-01T00:00:00Z',
	updatedAt: '2026-09-10T00:00:00Z',
	state: 'open',
	draft: false,
	labels: [],
	assignees: [],
	comments: 2,
	commits: 3,
	lastComment: null,
	ci: 'SUCCESS',
	reviewDecision: 'REVIEW_REQUIRED',
	mergeable: 'MERGEABLE',
	additions: 1,
	deletions: 1,
	lastCommitAt: null,
	reviewRequests: [],
	requestEvents: [],
	myReview: null,
	latestReview: null,
	verdicts: [],
	openThreads: 0,
	...over
});

const row = (over: Partial<ItemWithFacts> = {}): ItemWithFacts => ({
	key: 'o/r#7',
	repo: 'o/r',
	number: 7,
	subject_type: 'PullRequest',
	title: 'Old title',
	url: 'https://github.com/o/r/pull/7',
	event: 'review_requested',
	lane: 'turn',
	section: 'others',
	needs: 'review',
	summary: 's',
	reason: 'Review requested',
	why: 'Review requested',
	action_label: 'Review',
	action_url: 'https://github.com/o/r/pull/7/files',
	waiting_on: null,
	waiting_since: '2026-09-01T00:00:00Z',
	priority: 0,
	rule: null,
	sig: 'x',
	state: 'active',
	done_sig: null,
	override: null,
	override_sig: null,
	snoozed_until: null,
	snooze_event: null,
	snoozed_at: null,
	finished_at: null,
	finished_note: null,
	seen_at: null,
	seen_snapshot: null,
	pushed_sig: null,
	pushed_at: null,
	sources: '["notification"]',
	activity_at: '2026-09-10T00:00:00Z',
	first_seen_at: 0,
	facts: JSON.stringify(facts()),
	...over
});

describe('items', () => {
	it('reads owner, repo, and number from the key', () => {
		expect(subjectRefOf('acme/website#20481')).toEqual({
			key: 'acme/website#20481',
			owner: 'acme',
			repo: 'website',
			number: 20481
		});
		expect(subjectRefOf('t:123')).toBeNull();
	});

	it('shows the fresh facts, how long it waited, and whether you saw it', () => {
		const now = Date.parse('2026-09-10T00:00:00Z');
		const d = toDTO(row(), 'ian', 3, now);
		expect(d).toMatchObject({ title: 'Fresh title', stale: true, unseen: true, changes: null });
		expect(toDTO(row({ facts: null }), 'ian', 3, now).title).toBe('Old title');
		expect(toDTO(row({ override: 'updates' }), 'ian', 3, now)).toMatchObject({
			lane: 'updates',
			section: null
		});
	});

	it('says what changed since you saw it', () => {
		const seen = snapshotOf(facts({ commits: 1, comments: 1, ci: 'FAILURE' }), 'ian');
		const d = toDTO(
			row({
				seen_at: Date.parse('2026-09-05T00:00:00Z'),
				seen_snapshot: JSON.stringify(seen),
				facts: JSON.stringify(
					facts({ verdicts: [{ by: 'carol', at: '2026-09-09T00:00:00Z', state: 'APPROVED' }] })
				)
			}),
			'ian',
			3
		);
		expect(d.changes?.map((c) => c.text)).toEqual([
			'@carol approved',
			'+2 commits',
			'CI passes now',
			'1 new comment'
		]);
		expect(d.unseen).toBe(true);
	});
});
