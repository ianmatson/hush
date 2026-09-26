import {
	classify,
	classifyDefault,
	firstMatchingRule,
	validateRules
} from '../../src/lib/shared/classify';
import { validateDash } from '../../src/lib/shared/dashboard';
import { MENUS_VERSION, validateMenus } from '../../src/lib/shared/menus';
import { validateViews } from '../../src/lib/shared/views';
import type { Rule, Settings } from '../../src/lib/shared/types';
import {
	bumpVersion,
	parseSettings,
	type Env,
	type ThreadRow,
	type UserRow,
	factsFromRow
} from '../db';
import { MUTED_BY_USER } from '../poller';
import { routes, poller, json } from '../app';

// --- Settings ---------------------------------------------------------------

/** Re-run the classifier on stored threads after the settings change. */
async function reclassify(env: Env, u: UserRow, settings: Settings) {
	const myTeams = settings.teamReviewsAreAction
		? (await poller(env, u.id).teams()).teams.map((t) => t.slug)
		: [];
	const { results } = await env.DB.prepare('SELECT * FROM threads WHERE user_id = ?')
		.bind(u.id)
		.all<ThreadRow>();
	const stmts: D1PreparedStatement[] = [];
	for (const r of results) {
		if (r.rule === MUTED_BY_USER) continue;
		const cls = classify(factsFromRow(r, u.login, myTeams), settings);
		const same =
			cls.category === r.category &&
			cls.kind === r.kind &&
			cls.summary === r.summary &&
			(cls.rule ?? null) === r.rule &&
			cls.actionUrl === r.action_url;
		if (same) continue;
		stmts.push(
			env.DB.prepare(
				`UPDATE threads SET category = ?, kind = ?, summary = ?, why = ?, action_label = ?, action_url = ?, rule = ?
         WHERE user_id = ? AND id = ?`
			).bind(
				cls.category,
				cls.kind,
				cls.summary,
				cls.why,
				cls.actionLabel,
				cls.actionUrl,
				cls.rule ?? null,
				u.id,
				r.id
			)
		);
	}
	const changed = stmts.length;
	if (changed) stmts.push(bumpVersion(env, u.id));
	for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
	return changed;
}

const app = routes()
	/**
	 * Try rules on your stored threads without saving them: how many threads each rule would catch
	 * (first match wins), a few examples, and how many threads would change category compared with
	 * the saved rules. D1 only.
	 */
	.post('/api/rules/preview', json<{ rules: Rule[] }>(), async (c) => {
		const u = c.get('user');
		const body = c.req.valid('json');
		const err = validateRules(body.rules);
		if (err) return c.json({ error: err }, 400);
		const rules = body!.rules as Rule[];
		const saved = parseSettings(u.settings);
		const settings: Settings = { ...saved, rules };
		const myTeams = settings.teamReviewsAreAction
			? (await poller(c.env, u.id).teams()).teams.map((t) => t.slug)
			: [];
		const { results } = await c.env.DB.prepare('SELECT * FROM threads WHERE user_id = ?')
			.bind(u.id)
			.all<ThreadRow>();
		type Example = { title: string; repo: string; category: string };
		const perRule = rules.map(() => ({
			matches: 0,
			inInbox: 0,
			open: [] as Example[],
			other: [] as Example[]
		}));
		const moves = { action: 0, fyi: 0, muted: 0 };
		for (const r of results) {
			if (r.rule === MUTED_BY_USER) continue;
			const facts = factsFromRow(r, u.login, myTeams);
			const base = classifyDefault(facts, settings);
			const i = firstMatchingRule(facts, rules, base);
			const categoryWith = (list: Rule[], k: number) =>
				k < 0 ? base.category : (list[k].then.category ?? base.category);
			const category = categoryWith(rules, i);
			if (i >= 0) {
				const p = perRule[i];
				p.matches++;
				const open = r.triage === 'inbox' || r.triage === 'snoozed';
				if (open) p.inInbox++;
				const list = open ? p.open : p.other;
				if (list.length < 3) list.push({ title: r.title, repo: r.repo, category });
			}
			// The effect of your edits: compare with the rules you have saved now.
			const before = categoryWith(saved.rules, firstMatchingRule(facts, saved.rules, base));
			if (category !== before) moves[category as keyof typeof moves]++;
		}
		return c.json({
			// Examples: threads in the inbox first.
			perRule: perRule.map(({ open, other, ...p }) => ({
				...p,
				examples: [...open, ...other].slice(0, 3)
			})),
			moves,
			total: results.length
		});
	})
	.put('/api/settings', json<Settings>(), async (c) => {
		const u = c.get('user');
		const body = c.req.valid('json');
		const next: Settings = { ...parseSettings(u.settings) };
		for (const k of [
			'pushAction',
			'pushFyi',
			'pushTurnChanges',
			'pushResolved',
			'peekMarksRead',
			'botsAreFyi',
			'teamReviewsAreAction'
		] as const)
			if (typeof body[k] === 'boolean') next[k] = body[k];
		if (body.dash !== undefined) {
			const dash = { ...next.dash, ...body.dash };
			const err = validateDash(dash);
			if (err) return c.json({ error: err }, 400);
			next.dash = dash;
		}
		if (body.reviewResolution !== undefined) {
			if (body.reviewResolution !== 'strict' && body.reviewResolution !== 'any_review')
				return c.json({ error: 'reviewResolution must be "strict" or "any_review".' }, 400);
			next.reviewResolution = body.reviewResolution;
		}
		if (body.views !== undefined) {
			// A view's conditions are checked like a rule's (a rule with a no-op result).
			const whenError = (when: unknown) =>
				validateRules([{ when, then: { category: 'fyi' } }])?.replace(/^Rule 1: /, '') ?? null;
			const err = validateViews(body.views, whenError);
			if (err) return c.json({ error: err }, 400);
			next.views = body.views;
		}
		if (body.menus !== undefined) {
			const menus = { ...next.menus, ...body.menus, v: MENUS_VERSION };
			const err = validateMenus(menus);
			if (err) return c.json({ error: err }, 400);
			next.menus = menus;
		}
		if (body.rules !== undefined) {
			const err = validateRules(body.rules);
			if (err) return c.json({ error: err }, 400);
			next.rules = body.rules;
		}
		await c.env.DB.prepare('UPDATE users SET settings = ?, updated_at = ? WHERE id = ?')
			.bind(JSON.stringify(next), Date.now(), u.id)
			.run();
		// Only these settings change how threads are classified; the rest (menus, dashboards, push)
		// must not rewrite every thread.
		const affects =
			body.rules !== undefined ||
			typeof body.botsAreFyi === 'boolean' ||
			body.reviewResolution !== undefined ||
			typeof body.teamReviewsAreAction === 'boolean';
		const changed = affects ? await reclassify(c.env, u, next) : 0;
		return c.json({ settings: next, reclassified: changed });
	});

export default app;
