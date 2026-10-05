import { subjectKey } from './subject';
import type { DashItem } from './types';

export interface StackMember {
	key: string;
	repo: string;
	number: number;
	title: string;
	url: string;
	author: string;
	draft: boolean;
	itemInList: DashItem | null;
}

export interface Stack {
	bottomKey: string;
	repo: string;
	membersBottomFirst: StackMember[];
	mostUrgentInList: DashItem;
}

const MIN_STACK_SIZE = 2;

const memberOf = (i: DashItem): StackMember => ({
	key: i.id,
	repo: i.repo,
	number: i.number,
	title: i.title,
	url: i.url,
	author: i.author,
	draft: i.draft,
	itemInList: i
});

export function findStacks(itemsInListOrder: DashItem[]): Stack[] {
	const prs = itemsInListOrder.filter((i) => i.kind === 'pr');
	const members = new Map(prs.map((i) => [i.id, memberOf(i)]));
	const directlyUnder = new Map<string, string>();
	for (const i of prs) {
		let upper = i.id;
		for (const link of i.stackBelowNearestFirst ?? []) {
			const key = subjectKey(i.repo, link.number);
			if (!members.has(key)) members.set(key, { key, repo: i.repo, ...link, itemInList: null });
			if (!directlyUnder.has(upper)) directlyUnder.set(upper, key);
			upper = key;
		}
	}

	const bottomOf = (key: string) => {
		const seen = new Set([key]);
		let at = key;
		for (let next = directlyUnder.get(at); next && !seen.has(next); next = directlyUnder.get(at)) {
			seen.add(next);
			at = next;
		}
		return at;
	};
	const directlyAbove = new Map<string, StackMember[]>();
	for (const [upper, lower] of directlyUnder)
		directlyAbove.set(lower, [...(directlyAbove.get(lower) ?? []), members.get(upper)!]);

	const listPosition = new Map(prs.map((i, n) => [i.id, n]));
	const bottoms = new Set([...directlyUnder.keys()].map(bottomOf));
	const stacks: Stack[] = [];
	for (const bottomKey of bottoms) {
		const membersBottomFirst: StackMember[] = [];
		const visit = (key: string) => {
			if (membersBottomFirst.some((m) => m.key === key)) return;
			membersBottomFirst.push(members.get(key)!);
			const uppers = [...(directlyAbove.get(key) ?? [])].sort((a, b) => a.number - b.number);
			for (const m of uppers) visit(m.key);
		};
		visit(bottomKey);
		const inList = membersBottomFirst.flatMap((m) => (m.itemInList ? [m.itemInList] : []));
		if (membersBottomFirst.length < MIN_STACK_SIZE || !inList.length) continue;
		const mostUrgentInList = inList.reduce((a, b) =>
			listPosition.get(b.id)! < listPosition.get(a.id)! ? b : a
		);
		stacks.push({
			bottomKey,
			repo: membersBottomFirst[0].repo,
			membersBottomFirst,
			mostUrgentInList
		});
	}
	return stacks;
}

export function rotateToFront(stack: Stack, frontKey: string | undefined): StackMember[] {
	const members = stack.membersBottomFirst;
	const wanted = frontKey ?? stack.mostUrgentInList.id;
	const at = Math.max(
		0,
		members.findIndex((m) => m.key === wanted)
	);
	return [...members.slice(at), ...members.slice(0, at)];
}

export type ListUnit = { key: string; item: DashItem; stack: Stack | null };

export function unitsOf(
	itemsInGroupOrder: DashItem[],
	stackByMember: Map<string, Stack>
): ListUnit[] {
	return itemsInGroupOrder.flatMap((item): ListUnit[] => {
		const stack = stackByMember.get(item.id);
		if (!stack) return [{ key: item.id, item, stack: null }];
		const isPlacedHere = stack.mostUrgentInList.id === item.id;
		return isPlacedHere ? [{ key: `stack:${stack.bottomKey}`, item, stack }] : [];
	});
}

export function stackByMember(stacks: Stack[]): Map<string, Stack> {
	return new Map(stacks.flatMap((s) => s.membersBottomFirst.map((m) => [m.key, s] as const)));
}
