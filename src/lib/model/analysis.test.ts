import { describe, expect, it } from 'vitest';
import { groupChoice } from '../shared/categories';
import { conditionId } from '../shared/decisions';
import { analysisRequests, mergeAnalysis } from './analysis';
import { ANALYSIS_VERSION, BY_TOPIC, EFFORT, ME, NOW, facts } from './testing';

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
