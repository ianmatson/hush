import { describe, expect, it } from 'vitest';
import {
	applyPick,
	rankRefs,
	rankUsers,
	triggerAt,
	type RefSuggestion,
	type UserSuggestion
} from './suggest';

const at = (text: string) => triggerAt(text, text.length);

describe('triggerAt', () => {
	it('finds "@" at the start or after a space', () => {
		expect(at('@')).toEqual({ kind: 'user', start: 0, query: '' });
		expect(at('thanks @al')).toEqual({ kind: 'user', start: 7, query: 'al' });
		expect(at('(@al')).toEqual({ kind: 'user', start: 1, query: 'al' });
		expect(at('cc @PostHog/web')).toEqual({ kind: 'user', start: 3, query: 'PostHog/web' });
	});
	it('does not take an email address', () => {
		expect(at('mail me@exa')).toBeNull();
	});
	it('finds "#" and "owner/repo#"', () => {
		expect(at('see #')).toEqual({ kind: 'ref', start: 4, query: '', repo: null });
		expect(at('fixes #12')).toEqual({ kind: 'ref', start: 6, query: '12', repo: null });
		expect(at('see acme/web#log')).toEqual({
			kind: 'ref',
			start: 4,
			query: 'log',
			repo: 'acme/web'
		});
	});
	it('does not take a "#" inside a word, or after a space in the query', () => {
		expect(at('C#')).toBeNull();
		expect(at('#12 done')).toBeNull();
		expect(at('@al ')).toBeNull();
	});
	it('reads only up to the caret', () => {
		expect(triggerAt('hi @al there', 6)).toEqual({ kind: 'user', start: 3, query: 'al' });
	});
});

const user = (login: string, name: string | null = null, team = false): UserSuggestion => ({
	kind: 'user',
	login,
	name,
	avatar: null,
	team
});

describe('applyPick', () => {
	it('puts the login in place, with a space after', () => {
		const t = at('thanks @al')!;
		expect(applyPick('thanks @al', 10, t, user('alice'))).toEqual({
			text: 'thanks @alice ',
			caret: 14
		});
	});
	it('adds no second space', () => {
		const t = triggerAt('hi @al there', 6)!;
		expect(applyPick('hi @al there', 6, t, user('alice')).text).toBe('hi @alice there');
	});
	it('writes a reference to another repo in full', () => {
		const text = 'see acme/web#log';
		const r: RefSuggestion = {
			kind: 'ref',
			number: 7,
			title: 'Login',
			type: 'pr',
			state: 'open',
			repo: 'acme/web'
		};
		expect(applyPick(text, text.length, at(text)!, r).text).toBe('see acme/web#7 ');
	});
});

describe('rankUsers', () => {
	it('puts the conversation first, then the repo, then teams, and leaves you out', () => {
		const out = rankUsers(
			[user('bob'), user('ian')],
			[user('acme/web', 'Web', true), user('alice'), user('bob')],
			'',
			'ian'
		);
		expect(out.map((u) => u.login)).toEqual(['bob', 'alice', 'acme/web']);
	});
	it('matches the start of a login, a team slug, or a word of the name', () => {
		const all = [
			user('alice', 'Alice Smith'),
			user('bob', 'Robert Jones'),
			user('acme/jobs', null, true)
		];
		expect(rankUsers([], all, 'jo', 'ian').map((u) => u.login)).toEqual(['bob', 'acme/jobs']);
		expect(rankUsers([], all, 'AL', 'ian').map((u) => u.login)).toEqual(['alice']);
	});
});

describe('rankRefs', () => {
	const ref = (number: number): RefSuggestion => ({
		kind: 'ref',
		number,
		title: `#${number}`,
		type: 'issue',
		state: 'open',
		repo: null
	});
	it('puts an exact number first', () => {
		expect(rankRefs([ref(120), ref(12), ref(121)], '12').map((r) => r.number)).toEqual([
			12, 120, 121
		]);
	});
});
