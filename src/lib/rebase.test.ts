import { describe, expect, it } from 'vitest';
import { rebaseEditsOntoCurrent } from './rebase';

const view = (id: string, name = id, extra: Record<string, unknown> = {}) => ({
	id,
	name,
	...extra
});
const names = (views: { name: string }[]) => views.map((v) => v.name);

describe('rebaseEditsOntoCurrent', () => {
	it('takes the current value of everything you did not edit', () => {
		const base = { views: [view('mine')], hideBots: false };
		const current = { views: [view('mine'), view('other')], hideBots: true };
		expect(rebaseEditsOntoCurrent(base, base, current)).toEqual(current);
	});

	it('does not bring back a view that another tab deleted', () => {
		const base = [view('mine'), view('theirs')];
		const edited = [view('mine', 'Mine, renamed'), view('theirs')];
		const current = [view('mine')];
		expect(names(rebaseEditsOntoCurrent(base, edited, current))).toEqual(['Mine, renamed']);
	});

	it('keeps a view that another tab added, after yours', () => {
		const base = [view('mine')];
		const edited = [view('mine'), view('new', 'My new view')];
		const current = [view('mine'), view('theirs', 'Their view')];
		expect(names(rebaseEditsOntoCurrent(base, edited, current))).toEqual([
			'mine',
			'Their view',
			'My new view'
		]);
	});

	it('deletes what you deleted, even if another tab changed it', () => {
		const base = [view('mine'), view('old')];
		const edited = [view('mine')];
		const current = [view('mine'), view('old', 'Old, renamed elsewhere')];
		expect(names(rebaseEditsOntoCurrent(base, edited, current))).toEqual(['mine']);
	});

	it('keeps a view you edited, even if another tab deleted it', () => {
		const base = [view('mine'), view('shared')];
		const edited = [view('mine'), view('shared', 'Shared, renamed here')];
		const current = [view('mine')];
		expect(names(rebaseEditsOntoCurrent(base, edited, current))).toEqual([
			'mine',
			'Shared, renamed here'
		]);
	});

	it('merges edits to different fields of the same view', () => {
		const base = [view('mine', 'Mine', { groupBy: 'role' })];
		const edited = [view('mine', 'Mine', { groupBy: 'status' })];
		const current = [view('mine', 'Renamed elsewhere', { groupBy: 'role' })];
		expect(rebaseEditsOntoCurrent(base, edited, current)).toEqual([
			view('mine', 'Renamed elsewhere', { groupBy: 'status' })
		]);
	});

	it('uses your order when you reordered, with views added elsewhere at the end', () => {
		const base = [view('a'), view('b')];
		const edited = [view('b'), view('a')];
		const current = [view('a'), view('b'), view('c')];
		expect(names(rebaseEditsOntoCurrent(base, edited, current))).toEqual(['b', 'a', 'c']);
	});

	it('uses your value when both tabs changed the same field', () => {
		expect(rebaseEditsOntoCurrent({ staleDays: 3 }, { staleDays: 5 }, { staleDays: 7 })).toEqual({
			staleDays: 5
		});
	});

	it('uses your text as a whole', () => {
		expect(rebaseEditsOntoCurrent('{}', '{"a":1}', '{"b":2}')).toBe('{"a":1}');
	});
});
