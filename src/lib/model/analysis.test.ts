import { describe, expect, it } from 'vitest';
import { groupChoice } from '../shared/categories';
import { conditionId } from '../shared/decisions';
import type { SubjectFacts } from '../shared/subject';
import type { CategoryGroup } from '../shared/types';
import {
	analysisRequests,
	analysisView,
	identityInputOf,
	mergeAnalysis,
	replyInputOf,
	type AnalysisFamily,
	type AnalysisRequest
} from './analysis';
import { ANALYSIS_VERSION, BY_TOPIC, EFFORT, IMPACT, ME, NOW, facts } from './testing';
import type { Analysis } from './types';

const commented = facts(1, {
	lastComment: {
		author: 'bob',
		authorIsBot: false,
		body: 'Could you check this?',
		url: 'https://github.com/c/1',
		createdAt: new Date(NOW).toISOString()
	}
});

describe('analysisRequests', () => {
	it('asks identity questions with identity fields only, and reply questions with the full input', () => {
		const requests = analysisRequests(
			null,
			commented,
			ME,
			[EFFORT, BY_TOPIC],
			ANALYSIS_VERSION,
			NOW
		);
		const identity = requests.find((r) => r.family === 'identity')!;
		const reply = requests.find((r) => r.family === 'reply')!;
		expect(Object.keys(identity.request.questions).sort()).toEqual(
			[`about_${conditionId('database migrations')}`, `choice_${groupChoice(EFFORT)!.key}`].sort()
		);
		expect(identity.request.state).toMatchObject({ comments: [], you: { roles: [] } });
		expect(Object.keys(reply.request.questions).sort()).toEqual(['reply', 'urgency']);
		expect(reply.request.state.comments).toHaveLength(1);
	});

	it('asks nothing again once every answer for the current inputs is stored', () => {
		const [identity, reply] = analysisRequests(
			null,
			commented,
			ME,
			[EFFORT],
			ANALYSIS_VERSION,
			NOW
		);
		const choiceKey = Object.keys(identity.choiceKeys)[0];
		let analysis = mergeAnalysis(null, ANALYSIS_VERSION, identity, {
			[choiceKey]: { type: 'choice', choice: 'low', confidence: 0.9 }
		});
		analysis = mergeAnalysis(analysis, ANALYSIS_VERSION, reply, {
			reply: { type: 'noul', noul: 0.9 },
			urgency: { type: 'score', score: 1 }
		});
		expect(analysisRequests(analysis, commented, ME, [EFFORT], ANALYSIS_VERSION, NOW)).toEqual([]);
		expect(analysis).toMatchObject({
			choices: { [groupChoice(EFFORT)!.key]: 'low' },
			reply: 0.9,
			urgency: 1
		});
	});

	it('asks the reply family again when only the comments change, and keeps category answers', () => {
		const [identity] = analysisRequests(null, commented, ME, [EFFORT], ANALYSIS_VERSION, NOW);
		const analysis = mergeAnalysis(null, ANALYSIS_VERSION, identity, {
			[Object.keys(identity.choiceKeys)[0]]: { type: 'choice', choice: 'low', confidence: 0.9 }
		});
		const newComment = { ...commented, comments: 2 };
		newComment.lastComment = { ...commented.lastComment!, body: 'Any news?' };
		const again = analysisRequests(analysis, newComment, ME, [EFFORT], ANALYSIS_VERSION, NOW);
		expect(again.map((r) => r.family)).toEqual(['reply']);
	});

	it('skips about: questions whose rules cannot match on known facts', () => {
		const onlyIssues = {
			...BY_TOPIC,
			categories: BY_TOPIC.categories.map((c) => ({ ...c, rule: `is:issue ${c.rule}` }))
		};
		const requests = analysisRequests(null, facts(2), ME, [onlyIssues], ANALYSIS_VERSION, NOW);
		expect(requests.map((r) => r.family)).toEqual(['reply']);
	});
});

describe('mergeAnalysis', () => {
	it('returns nothing for an answer without any usable value, so stale answers stay', () => {
		const [identity, reply] = analysisRequests(
			null,
			commented,
			ME,
			[EFFORT],
			ANALYSIS_VERSION,
			NOW
		);
		expect(mergeAnalysis(null, ANALYSIS_VERSION, identity, {})).toBeNull();
		expect(mergeAnalysis(null, ANALYSIS_VERSION, reply, {})).toBeNull();
	});
});

describe('mergeAnalysis with a changed identity', () => {
	it('keeps the old answers until every new identity answer is in', () => {
		const [identity] = analysisRequests(
			null,
			commented,
			ME,
			[EFFORT, BY_TOPIC],
			ANALYSIS_VERSION,
			NOW
		);
		const full = Object.fromEntries([
			...Object.keys(identity.aboutIds).map((key) => [key, { type: 'noul', noul: 0.9 }] as const),
			...Object.keys(identity.choiceKeys).map(
				(key) => [key, { type: 'choice', choice: 'low', confidence: 0.9 }] as const
			)
		]);
		const stored = mergeAnalysis(null, ANALYSIS_VERSION, identity, full)!;
		const renamed = { ...commented, title: 'Renamed' };
		const [again] = analysisRequests(
			stored,
			renamed,
			ME,
			[EFFORT, BY_TOPIC],
			ANALYSIS_VERSION,
			NOW
		);
		const onlyAbout = Object.fromEntries(
			Object.keys(again.aboutIds).map((key) => [key, { type: 'noul', noul: 0.1 }] as const)
		);
		expect(mergeAnalysis(stored, ANALYSIS_VERSION, again, onlyAbout)).toBeNull();
	});
});

const comment = (author: string, body: string, authorIsBot = false) => ({
	author,
	authorIsBot,
	body,
	url: `https://github.com/c/${author}`,
	createdAt: new Date(NOW).toISOString()
});

const requestsFor = (
	subject: SubjectFacts,
	groups: CategoryGroup[],
	analysis: Analysis | null = null
) => analysisRequests(analysis, subject, ME, groups, ANALYSIS_VERSION, NOW);

const questionsOf = (request: AnalysisRequest | undefined) =>
	Object.keys(request?.request.questions ?? {}).sort();

const familyOf = (requests: AnalysisRequest[], family: AnalysisFamily) =>
	requests.find((r) => r.family === family);

const MIGRATIONS = conditionId('database migrations');
const EFFORT_KEY = groupChoice(EFFORT)!.key;
const IMPACT_KEY = groupChoice(IMPACT)!.key;

function answered(subject: SubjectFacts, over: Partial<Analysis> = {}): Analysis {
	return {
		version: ANALYSIS_VERSION,
		replyInput: replyInputOf(subject, ME),
		identityInput: identityInputOf(subject),
		reply: 0.1,
		urgency: 0.2,
		about: { [MIGRATIONS]: 0.9 },
		choices: { [EFFORT_KEY]: 'low' },
		...over
	};
}

describe('analysisRequests for comments', () => {
	it('asks about the comments when the newest one is by another person', () => {
		const mine = facts(3, { author: ME, lastComment: comment('bob', 'Thanks, looks good!') });
		const reply = familyOf(requestsFor(mine, []), 'reply')!;
		expect(questionsOf(reply)).toEqual(['reply', 'urgency']);
		expect(reply.request.state.newCommentsForYou).toEqual([
			{ author: 'bob', body: 'Thanks, looks good!' }
		]);
		expect(reply.request.state.you.roles).toEqual(['author']);
	});

	it('does not ask about comments by bots, by you, or when there are none', () => {
		for (const lastComment of [
			comment('renovate[bot]', 'Rebased', true),
			comment(ME, 'Pushed a fix'),
			null
		])
			expect(questionsOf(familyOf(requestsFor(facts(4, { lastComment }), []), 'reply'))).toEqual([
				'urgency'
			]);
	});
});

describe('analysisRequests for categories', () => {
	it('asks one choice for each group with descriptions, and the conditions of a new item', () => {
		const identity = familyOf(requestsFor(facts(5), [EFFORT, IMPACT, BY_TOPIC]), 'identity')!;
		expect(questionsOf(identity)).toEqual(
			[`about_${MIGRATIONS}`, `choice_${EFFORT_KEY}`, `choice_${IMPACT_KEY}`].sort()
		);
		expect(identity.request.questions[`choice_${EFFORT_KEY}`]).toMatchObject({
			type: 'choice',
			criteria: groupChoice(EFFORT)!.options
		});
		expect(identity.request.questions[`about_${MIGRATIONS}`]).toMatchObject({ type: 'noul' });
	});

	it('asks only a new condition or a changed group of an item it already read', () => {
		const subject = facts(6);
		const noAbout = answered(subject, { about: {} });
		expect(requestsFor(subject, [EFFORT, BY_TOPIC], noAbout).map(questionsOf)).toEqual([
			[`about_${MIGRATIONS}`]
		]);
		const oldGroup = answered(subject, { choices: { 'old-options': 'low' } });
		expect(requestsFor(subject, [EFFORT, BY_TOPIC], oldGroup).map(questionsOf)).toEqual([
			[`choice_${EFFORT_KEY}`]
		]);
	});

	it('asks the category and conditions again when the title, description, or labels change', () => {
		const subject = facts(7);
		const stored = answered(subject);
		for (const changed of [
			{ ...subject, title: 'Revert the login change' },
			{ ...subject, body: 'A new description' },
			{ ...subject, labels: [{ name: 'security', color: 'ededed' }] }
		])
			expect(
				questionsOf(familyOf(requestsFor(changed, [EFFORT, BY_TOPIC], stored), 'identity'))
			).toEqual([`about_${MIGRATIONS}`, `choice_${EFFORT_KEY}`].sort());
	});

	it('does not ask again for new commits, CI, or reviews', () => {
		const subject = facts(8);
		const moved: SubjectFacts = {
			...subject,
			ci: 'FAILURE',
			lastCommitAt: new Date(NOW).toISOString(),
			reviewDecision: 'APPROVED'
		};
		expect(requestsFor(moved, [EFFORT, BY_TOPIC], answered(subject))).toEqual([]);
	});
});

describe('analysisView', () => {
	const subject = facts(9, { lastComment: comment('bob', 'Can you check?') });

	it('reads the answers for the current inputs', () => {
		const stored = answered(subject, {
			reply: 0.05,
			urgency: 1.8,
			about: { a: 0.95, b: 0.5, c: 0.1 },
			choices: { area: 'bugs' }
		});
		expect(analysisView(stored, subject, ME, true, ANALYSIS_VERSION).decisions).toEqual({
			commentsNeedMe: false,
			urgent: true,
			smart: ['a'],
			choices: { area: 'bugs' }
		});
	});

	it('keeps the category and conditions after a new comment', () => {
		const stored = answered(subject, {
			reply: 0.05,
			urgency: 1.8,
			about: { a: 0.95 },
			choices: { area: 'bugs' }
		});
		const commented = { ...subject, lastComment: comment('carol', 'Any news?') };
		const view = analysisView(stored, commented, ME, true, ANALYSIS_VERSION);
		expect(view.decisions).toEqual({
			commentsNeedMe: null,
			urgent: false,
			smart: ['a'],
			choices: { area: 'bugs' }
		});
		expect(view.stale).toBe(false);
	});

	it('ignores reply answers for older comments, and uses older category answers only leniently', () => {
		const old = answered(subject, {
			replyInput: 'old',
			identityInput: 'old',
			reply: 0.05,
			urgency: 1.8,
			about: { a: 0.95 }
		});
		const view = analysisView(old, subject, ME, true, ANALYSIS_VERSION);
		expect(view.decisions).toMatchObject({ commentsNeedMe: null, urgent: false });
		expect(view.stale).toBe(true);
		expect(view.strict.about.size).toBe(0);
		expect(view.lenient.about.get('a')).toBe(true);
	});
});

describe('mergeAnalysis of each family', () => {
	const subject = facts(10, { lastComment: comment('bob', 'Could you look?') });

	it('keeps the identity answers when only the comments were asked again', () => {
		const stored = answered(subject, { replyInput: 'old', urgency: undefined });
		const reply = familyOf(requestsFor(subject, [EFFORT, BY_TOPIC], stored), 'reply')!;
		expect(
			mergeAnalysis(stored, ANALYSIS_VERSION, reply, {
				reply: { type: 'noul', noul: 0.95 },
				urgency: { type: 'score', score: 0.3 }
			})
		).toEqual({
			...stored,
			replyInput: replyInputOf(subject, ME),
			reply: 0.95,
			urgency: 0.3
		});
	});

	it('stores the choice of each group and the conditions of a new item', () => {
		const identity = familyOf(requestsFor(subject, [EFFORT, BY_TOPIC]), 'identity')!;
		expect(
			mergeAnalysis(null, ANALYSIS_VERSION, identity, {
				[`about_${MIGRATIONS}`]: { type: 'noul', noul: 0.1 },
				[`choice_${EFFORT_KEY}`]: { type: 'choice', choice: 'low', confidence: 0.75 }
			})
		).toMatchObject({
			identityInput: identityInputOf(subject),
			about: { [MIGRATIONS]: 0.1 },
			choices: { [EFFORT_KEY]: 'low' }
		});
	});

	it('keeps a choice Jev was unsure about: each item gets one category', () => {
		const identity = familyOf(requestsFor(subject, [EFFORT]), 'identity')!;
		expect(
			mergeAnalysis(null, ANALYSIS_VERSION, identity, {
				[`choice_${EFFORT_KEY}`]: { type: 'choice', choice: 'high', confidence: 0.2 }
			})?.choices
		).toEqual({ [EFFORT_KEY]: 'high' });
	});

	it('adds the choice of a new group to the stored choices', () => {
		const stored = answered(subject, { about: {} });
		const identity = familyOf(requestsFor(subject, [EFFORT, IMPACT], stored), 'identity')!;
		expect(questionsOf(identity)).toEqual([`choice_${IMPACT_KEY}`]);
		expect(
			mergeAnalysis(stored, ANALYSIS_VERSION, identity, {
				[`choice_${IMPACT_KEY}`]: { type: 'choice', choice: 'large', confidence: 0.6 }
			})?.choices
		).toEqual({ [EFFORT_KEY]: 'low', [IMPACT_KEY]: 'large' });
	});
});
