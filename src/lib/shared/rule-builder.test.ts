import { describe, expect, it } from 'vitest';
import { parseExpr } from './query';
import {
	builderToQuery,
	describeBuilder,
	emptyCondition,
	queryToBuilder,
	sizeDraftOf,
	sizeValue,
	withChips,
	type BuilderState
} from './rule-builder';

const roundTrip = (query: string) => {
	const state = queryToBuilder(query);
	expect(state).not.toBeNull();
	return builderToQuery(state!);
};

describe('rule builder', () => {
	it.each([
		'repo:acme/*',
		'repo:acme/* author:bots',
		'repo:acme/web OR label:bug',
		'repo:acme/* (label:bug OR label:crash)',
		'-author:bots label:docs',
		'is:draft size:<50',
		'about:"database migrations"',
		'type:pr label:bug',
		'label:bug,crash',
		'login flow',
		'-login',
		'author:alice,bots',
		'from:bob author:bots'
	])('keeps the meaning of %s', (query) => {
		const back = roundTrip(query);
		expect(parseExpr(back).errors).toEqual([]);
		expect(parseExpr(back).expr).toEqual(parseExpr(query).expr);
	});

	it('reads groups at one level', () => {
		expect(queryToBuilder('repo:acme/* (label:bug OR label:crash)')).toEqual({
			mode: 'all',
			items: [
				{ type: 'condition', word: 'repo', negate: false, values: ['acme/*'] },
				{
					type: 'group',
					mode: 'any',
					conditions: [
						{ type: 'condition', word: 'label', negate: false, values: ['bug'] },
						{ type: 'condition', word: 'label', negate: false, values: ['crash'] }
					]
				}
			]
		});
	});

	it('leaves queries it cannot show to the text editor', () => {
		expect(queryToBuilder('repo:a (label:b OR (label:c author:d))')).toBeNull();
		expect(queryToBuilder('nope:1')).toBeNull();
	});

	it('leaves a negated group of words to the text editor, which keeps its meaning', () => {
		expect(queryToBuilder('-(foo bar)')).toBeNull();
		expect(queryToBuilder('-"foo bar"')).toBeNull();
		expect(queryToBuilder('label:x -(foo bar)')).toBeNull();
	});

	it('shows bots among other values as one condition', () => {
		expect(queryToBuilder('author:alice,bots')?.items).toEqual([
			{ type: 'condition', word: 'author', negate: false, values: ['alice', 'bots'] }
		]);
		expect(describeBuilder(queryToBuilder('author:alice,bots')!)).toBe('Author is alice or a bot.');
	});

	it('writes nothing for empty conditions', () => {
		const state: BuilderState = { mode: 'all', items: [emptyCondition(), emptyCondition('label')] };
		expect(builderToQuery(state)).toBe('');
	});

	it('quotes values with spaces', () => {
		const state: BuilderState = {
			mode: 'any',
			items: [
				{ type: 'condition', word: 'label', negate: false, values: ['good first issue'] },
				{ type: 'condition', word: 'author', negate: true, values: ['bots'] }
			]
		};
		expect(builderToQuery(state)).toBe('label:"good first issue" OR -author:bots');
	});

	it('says what a rule matches in plain words', () => {
		expect(describeBuilder(queryToBuilder('repo:acme/* -author:bots')!)).toBe(
			'Repository is acme/* and author is not a bot.'
		);
		expect(describeBuilder(queryToBuilder('label:bug OR type:pr')!)).toBe(
			'Label is bug or type is pull request.'
		);
		expect(describeBuilder({ mode: 'all', items: [] })).toBe('Matches everything.');
		expect(describeBuilder(queryToBuilder('type:pr size:<50')!)).toBe(
			'Type is pull request and under 50 changed lines.'
		);
		expect(describeBuilder(queryToBuilder('size:10..200')!)).toBe('10 to 200 changed lines.');
		expect(describeBuilder(queryToBuilder('comments:>10')!)).toBe('Over 10 comments.');
		expect(describeBuilder(queryToBuilder('status:failure review:none')!)).toBe(
			'No review yet and CI failed.'
		);
		expect(describeBuilder(queryToBuilder('updated:<@today-14d')!)).toBe(
			'Updated before 14 days ago.'
		);
		expect(describeBuilder(queryToBuilder('created:2026-01-01..@today')!)).toBe(
			'Opened between 2026-01-01 and today.'
		);
		expect(describeBuilder(queryToBuilder('label:blocked OR about:"It waits"')!)).toBe(
			'Label is blocked or about “It waits”.'
		);
	});

	it.each(['<50', '<=50', '50', '>=50', '>50', '10..200'])(
		'keeps the meaning of size:%s in the size editor',
		(value) => {
			expect(sizeValue(sizeDraftOf(value))).toBe(value);
		}
	);

	it('keeps a range that has only one bound as a draft, with no value yet', () => {
		expect(sizeDraftOf('')).toEqual({ op: '<', from: '', to: '' });
		expect(sizeValue({ op: '..', from: '10', to: '' })).toBe('');
		expect(sizeValue({ op: '..', from: '', to: '50' })).toBe('');
		expect(sizeValue({ op: '>=', from: '', to: '' })).toBe('');
	});

	it('adds pasted chips once each, trimmed, in the order they came', () => {
		expect(withChips([], 'bug,bug')).toEqual(['bug']);
		expect(withChips(['docs'], ' bug \ncrash, docs,bug,')).toEqual(['docs', 'bug', 'crash']);
		expect(withChips(['bug'], 'Bug')).toEqual(['bug', 'Bug']);
	});
});
