import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../shared/durations';
import { compileViews } from './compile';
import { compileContext, team, view } from './testing';

describe('compileViews', () => {
	it('shares one source between views that run the same search, and keeps each filter on its own clause', () => {
		const { views, sources } = compileViews(
			[
				view('a', ['is:pr is:open repo:PostHog/posthog size:<50']),
				view('b', ['is:pr is:open repo:PostHog/posthog'])
			],
			compileContext()
		);
		expect(sources).toHaveLength(1);
		expect(views[0].clauses[0].sourceId).toBe(views[1].clauses[0].sourceId);
		expect(views[0].clauses[0].local).toBe('size:<50');
		expect(views[1].clauses[0].local).toBe('');
	});

	it('keeps the source id and the binding when @today rolls over, and changes only the query that runs', () => {
		const search = ['is:pr updated:>@today-7d'];
		const today = compileViews([view('a', search)], compileContext());
		const tomorrow = compileViews(
			[view('a', search)],
			compileContext({ now: compileContext().now + DAY_MS })
		);
		expect(tomorrow.sources[0].id).toBe(today.sources[0].id);
		expect(tomorrow.views[0].clauses[0].binding).toBe(today.views[0].clauses[0].binding);
		expect(tomorrow.views[0].scope).toBe(today.views[0].scope);
		expect(tomorrow.sources[0].query).not.toBe(today.sources[0].query);
	});

	it('makes one binding for each team that @team expands to', () => {
		const { views, sources } = compileViews(
			[view('teams', ['is:pr is:open team:@team'])],
			compileContext({ teams: [team('posthog/web'), team('posthog/infra')] })
		);
		expect(sources.map((s) => s.query)).toEqual([
			expect.stringContaining('team:posthog/web'),
			expect.stringContaining('team:posthog/infra')
		]);
		expect(new Set(views[0].clauses.map((c) => c.binding)).size).toBe(2);
	});

	it('marks board searches and open-only searches on their clauses', () => {
		const { views } = compileViews(
			[
				view('board', ['project:PostHog/7 status:Doing']),
				view('open', ['is:pr is:open author:@me'])
			],
			compileContext()
		);
		expect(views[0].clauses.every((c) => c.onBoard)).toBe(true);
		expect(views[1].clauses[0]).toMatchObject({ onBoard: false, openOnly: true, kind: 'pr' });
	});

	it('changes the scope when what decides membership changes, and not for display settings', () => {
		const base = view('a', ['is:pr is:open author:@me']);
		const scopeOf = (v = base, ctx = compileContext()) => compileViews([v], ctx).views[0].scope;
		expect(scopeOf({ ...base, name: 'renamed', groupBy: 'repo', pushNew: true })).toBe(scopeOf());
		expect(scopeOf({ ...base, searches: ['is:pr is:open assignee:@me'] })).not.toBe(scopeOf());
		expect(
			scopeOf(base, compileContext({ dash: { ...compileContext().dash, hideBots: false } }))
		).not.toBe(scopeOf());
	});

	it('ties the scope to category definitions only when a search filters by category', () => {
		const plain = view('a', ['is:pr is:open']);
		const byCategory = view('b', ['is:pr is:open category:effort/low']);
		const renamedGroup = compileContext({
			categoryGroups: [{ ...compileContext().categoryGroups[0], name: 'Size' }]
		});
		const scopes = (ctx = compileContext()) =>
			compileViews([plain, byCategory], ctx).views.map((v) => v.scope);
		const [plainBefore, categoryBefore] = scopes();
		const [plainAfter, categoryAfter] = scopes(renamedGroup);
		expect(plainAfter).toBe(plainBefore);
		expect(categoryAfter).not.toBe(categoryBefore);
	});
});
