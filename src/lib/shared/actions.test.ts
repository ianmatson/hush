import { describe, expect, it } from 'vitest';
import { ghActions, mainAction } from './actions';
import { NO_STACK } from './stack-merge';
import type { PeekDTO } from './types';

const pr = (over: Partial<PeekDTO> = {}, can: Partial<PeekDTO['can']['pr']> = {}): PeekDTO =>
	({
		kind: 'pr',
		number: 1,
		title: 'T',
		url: 'u',
		repo: 'acme/web',
		state: 'open',
		draft: false,
		author: { login: 'bob', avatar: null, bot: false },
		createdAt: '',
		html: '',
		labels: [],
		assignees: [],
		timeline: { total: 0, items: [] },
		can: {
			id: 'PR_1',
			author: false,
			close: true,
			reopen: false,
			comment: true,
			permission: 'WRITE',
			pr: {
				headOid: 'a'.repeat(40),
				mergeState: 'CLEAN',
				methods: ['SQUASH'],
				mergeAsAdmin: false,
				autoMerge: { on: false, method: null, canEnable: false, canDisable: false },
				failedRuns: [],
				stack: NO_STACK,
				...can
			}
		},
		...over
	}) as PeekDTO;

const ids = (p: PeekDTO) => ghActions(p).map((a) => a.id);
const blocked = (p: PeekDTO, id: string) => ghActions(p).find((a) => a.id === id)?.blocked;

describe('actions on GitHub', () => {
	it('offers review, merge, comment, and close on an open PR', () => {
		expect(ids(pr())).toEqual(['approve', 'request_changes', 'merge', 'comment', 'close']);
		expect(blocked(pr(), 'merge')).toBeUndefined();
	});

	it('blocks reviews of your own PR', () => {
		const own = pr({ can: { ...pr().can, author: true } });
		expect(blocked(own, 'approve')).toMatch(/own pull request/);
	});

	it('explains why a merge is blocked', () => {
		expect(blocked(pr({}, { mergeState: 'DIRTY' }), 'merge')).toMatch(/conflicts/);
		expect(blocked(pr({}, { mergeState: 'BLOCKED' }), 'merge')).toMatch(/Required/);
		expect(blocked(pr({}, { mergeState: 'BLOCKED', mergeAsAdmin: true }), 'merge')).toBeUndefined();
		expect(blocked(pr({ can: { ...pr().can, permission: 'READ' } }), 'merge')).toMatch(
			/cannot merge/
		);
	});

	it('offers re-run and auto-merge only when they apply', () => {
		expect(ids(pr({}, { failedRuns: [7] }))).toContain('rerun');
		const auto = { on: false, method: null, canEnable: true, canDisable: false };
		expect(ids(pr({}, { autoMerge: auto }))).toContain('auto_merge');
		expect(ids(pr({}, { autoMerge: { ...auto, on: true, canDisable: true } }))).toContain(
			'auto_merge_off'
		);
	});

	it('closes issues as done or not planned, and reopens closed ones', () => {
		const issue = pr({ kind: 'issue', can: { ...pr().can, pr: undefined } });
		expect(ids(issue)).toEqual(['comment', 'close', 'close_not_planned']);
		const closed = pr({
			kind: 'issue',
			state: 'closed',
			can: { ...pr().can, pr: undefined, reopen: true }
		});
		expect(ids(closed)).toEqual(['comment', 'reopen']);
		expect(ids(pr({ state: 'merged' }))).toEqual(['comment']);
	});

	it('picks the main action from what the thread asks of you', () => {
		expect(mainAction('review', ghActions(pr()))?.id).toBe('approve');
		expect(mainAction('merge', ghActions(pr({}, { mergeState: 'DIRTY' })))?.id).toBe('comment');
		expect(mainAction('fix_ci', ghActions(pr({}, { failedRuns: [1] })))?.id).toBe('rerun');
		expect(mainAction(null, ghActions(pr()))?.id).toBe('comment');
	});
});
