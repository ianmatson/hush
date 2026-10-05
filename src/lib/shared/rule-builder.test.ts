import { describe, expect, it } from 'vitest';
import { parseExpr } from './query';
import {
	builderToQuery,
	describeBuilder,
	emptyCondition,
	queryToBuilder,
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
		'type:pr needs:review',
		'label:bug,crash',
		'login flow'
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
			'Under 50 changed lines and type is pull request.'
		);
		expect(describeBuilder(queryToBuilder('size:10..200')!)).toBe('10 to 200 changed lines.');
		expect(describeBuilder(queryToBuilder('label:blocked OR about:"It waits"')!)).toBe(
			'Label is blocked or about “It waits”.'
		);
	});
});
