import { describe, expect, it } from 'vitest';
import { findStacks, rotateToFront, stackByMember, unitsOf } from './stacks';
import type { DashItem, StackLink } from './types';

const link = (number: number): StackLink => ({
	number,
	title: `PR ${number}`,
	url: `https://github.com/o/r/pull/${number}`,
	author: 'alice',
	draft: false
});

const pr = (number: number, below: number[] = [], over: Partial<DashItem> = {}): DashItem =>
	({
		id: `o/r#${number}`,
		kind: 'pr',
		number,
		title: `PR ${number}`,
		url: `https://github.com/o/r/pull/${number}`,
		repo: 'o/r',
		author: 'alice',
		draft: false,
		turn: 'them',
		stackBelowNearestFirst: below.map(link),
		...over
	}) as DashItem;

const numbers = (members: { number: number }[]) => members.map((m) => m.number);

describe('findStacks', () => {
	it('orders a chain from the bottom up, whatever the list order', () => {
		const [stack] = findStacks([pr(3, [2, 1]), pr(1), pr(2, [1])]);
		expect(numbers(stack.membersBottomFirst)).toEqual([1, 2, 3]);
		expect(stack.bottomKey).toBe('o/r#1');
	});

	it('leads with the first member in list order', () => {
		const [stack] = findStacks([pr(2, [1]), pr(3, [2, 1]), pr(1)]);
		expect(stack.mostUrgentInList.number).toBe(2);
	});

	it('fills a gap with a PR that is not in the list', () => {
		const [stack] = findStacks([pr(1), pr(3, [2, 1])]);
		expect(numbers(stack.membersBottomFirst)).toEqual([1, 2, 3]);
		expect(stack.membersBottomFirst[1].itemInList).toBeNull();
	});

	it('makes a stack from one listed PR on top of an unlisted one', () => {
		const [stack] = findStacks([pr(5, [4])]);
		expect(numbers(stack.membersBottomFirst)).toEqual([4, 5]);
	});

	it('leaves a PR with nothing under it alone', () => {
		expect(findStacks([pr(1), pr(2)])).toEqual([]);
	});

	it('keeps branches of one stack together, lower numbers first', () => {
		const [stack] = findStacks([pr(3, [1]), pr(2, [1]), pr(4, [2, 1])]);
		expect(numbers(stack.membersBottomFirst)).toEqual([1, 2, 4, 3]);
	});

	it('keeps repositories apart', () => {
		const other = pr(2, [1], { id: 'o/x#2', repo: 'o/x' });
		const stacks = findStacks([pr(2, [1]), other]);
		expect(stacks.map((s) => s.bottomKey).sort()).toEqual(['o/r#1', 'o/x#1']);
	});

	it('ignores issues', () => {
		expect(findStacks([pr(2, [1], { kind: 'issue' })])).toEqual([]);
	});
});

describe('rotateToFront', () => {
	const [stack] = findStacks([pr(3, [2, 1]), pr(2, [1]), pr(1), pr(4, [3, 2])]);

	it('starts at the most urgent member by default', () => {
		expect(numbers(rotateToFront(stack, undefined))).toEqual([3, 4, 1, 2]);
	});

	it('turns the stack so the chosen member is first', () => {
		expect(numbers(rotateToFront(stack, 'o/r#2'))).toEqual([2, 3, 4, 1]);
	});

	it('falls back to the bottom for a key that left the stack', () => {
		expect(numbers(rotateToFront(stack, 'o/r#99'))).toEqual([1, 2, 3, 4]);
	});
});

describe('unitsOf', () => {
	it('puts one unit per stack where its most urgent member is', () => {
		const items = [pr(9), pr(2, [1]), pr(1), pr(8)];
		const index = stackByMember(findStacks(items));
		const units = unitsOf(items, index);
		expect(units.map((u) => u.key)).toEqual(['o/r#9', 'stack:o/r#1', 'o/r#8']);
		expect(units[1].item.number).toBe(2);
	});
});
