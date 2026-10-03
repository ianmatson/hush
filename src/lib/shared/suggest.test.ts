import { describe, expect, it } from 'vitest';
import {
	applyPick,
	closedShortcodeBefore,
	emojiForShortcode,
	rankEmoji,
	rankRefs,
	rankUsers,
	replaceWithEmoji,
	triggerAt,
	type EmojiEntry,
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

describe('emoji', () => {
	const list: EmojiEntry[] = [
		{ emoji: '😄', names: ['smile'], tags: ['happy'] },
		{ emoji: '😺', names: ['smiley_cat'], tags: [] },
		{ emoji: '😀', names: ['grinning'], tags: ['smile', 'happy'] },
		{ emoji: '🙂', names: ['slightly_smiling_face'], tags: [] },
		{ emoji: '🎉', names: ['tada', 'hooray'], tags: ['party'] }
	];

	it('opens after ":" and two letters, at the start or after a space', () => {
		expect(at(':s')).toBeNull();
		expect(at('nice :sm')).toEqual({ kind: 'emoji', start: 5, query: 'sm' });
		expect(at('(:tada')).toEqual({ kind: 'emoji', start: 1, query: 'tada' });
	});
	it('does not open inside a word or a time', () => {
		expect(at('at 10:30')).toBeNull();
		expect(at('note:ab')).toBeNull();
	});
	it('ranks name prefixes (shortest first), then names that contain, then tags', () => {
		expect(rankEmoji(list, 'smil').map((e) => e.emoji)).toEqual(['😄', '😺', '🙂', '😀']);
	});
	it('shows the name that matched', () => {
		expect(rankEmoji(list, 'hoo')).toEqual([{ kind: 'emoji', emoji: '🎉', shortcode: 'hooray' }]);
	});
	it('puts the emoji in place of the query', () => {
		const text = 'ship it :ta';
		const e = rankEmoji(list, 'ta')[0];
		expect(applyPick(text, text.length, at(text)!, e)).toEqual({
			text: 'ship it 🎉 ',
			caret: 8 + '🎉 '.length
		});
	});
	it('turns a closed shortcode into its emoji', () => {
		const text = 'ship it :Tada:';
		const closed = closedShortcodeBefore(text, text.length)!;
		expect(closed).toEqual({ start: 8, shortcode: 'tada' });
		const emoji = emojiForShortcode(list, closed.shortcode)!;
		expect(replaceWithEmoji(text, text.length, closed.start, emoji).text).toBe('ship it 🎉');
		expect(closedShortcodeBefore('at 10:30:', 9)).toBeNull();
		expect(emojiForShortcode(list, 'nope')).toBeNull();
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
