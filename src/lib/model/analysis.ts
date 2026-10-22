import { replyFromOthers } from '../shared/activity';
import { groupChoices, markQueries } from '../shared/categories';
import {
	ABOUT_PREFIX,
	aboutQuestion,
	CHOICE_PREFIX,
	choiceOf,
	choiceQuestion,
	conditionId,
	cyrb53,
	decisionState,
	NO_DECISIONS,
	noulOf,
	REPLY,
	replyQuestion,
	scoreOf,
	URGENCY,
	URGENCY_QUESTION,
	URGENT_SCORE,
	yesOrNo,
	type DecisionAnswers,
	type DecisionQuestion,
	type DecisionRequest,
	type DecisionState,
	type SubjectDecisions
} from '../shared/decisions';
import { aboutTexts } from '../shared/query';
import { subjectRuleFacts, type SubjectFacts } from '../shared/subject';
import type { CategoryGroup } from '../shared/types';
import { queryTri, type Knowledge } from './eligibility';
import type { Analysis } from './types';

export const replyInput = (facts: SubjectFacts, me: string): DecisionState =>
	decisionState(facts, me);

export const identityInput = (facts: SubjectFacts): DecisionState => ({
	...decisionState(facts, ''),
	comments: [],
	newCommentsForYou: [],
	you: { login: '', roles: [] }
});

const inputHash = (input: DecisionState) => cyrb53(JSON.stringify(input));

export const replyInputOf = (facts: SubjectFacts, me: string) => inputHash(replyInput(facts, me));

export const identityInputOf = (facts: SubjectFacts) => inputHash(identityInput(facts));

export interface AnalysisView {
	decisions: SubjectDecisions;
	strict: Knowledge;
	lenient: Knowledge;
	stale: boolean;
}

const NOTHING_KNOWN = (smartOn: boolean): Knowledge => ({
	smartOn,
	about: new Map(),
	choices: new Map()
});

function knowledgeOf(analysis: Analysis): Knowledge {
	return {
		smartOn: true,
		about: new Map(Object.entries(analysis.about).map(([id, p]) => [id, yesOrNo(p)])),
		choices: new Map(Object.entries(analysis.choices))
	};
}

export function analysisView(
	analysis: Analysis | null,
	facts: SubjectFacts,
	me: string,
	smartOn: boolean,
	version: string
): AnalysisView {
	if (!smartOn || !analysis || analysis.version !== version) {
		const none = NOTHING_KNOWN(smartOn);
		return { decisions: NO_DECISIONS, strict: none, lenient: none, stale: false };
	}
	const replyFresh = analysis.replyInput === replyInputOf(facts, me);
	const stale = analysis.identityInput !== identityInputOf(facts);
	const lenient = knowledgeOf(analysis);
	return {
		decisions: {
			commentsNeedMe: replyFresh ? yesOrNo(analysis.reply) : null,
			urgent: replyFresh && (analysis.urgency ?? 0) >= URGENT_SCORE,
			smart: [...lenient.about].filter(([, yes]) => yes).map(([id]) => id),
			choices: Object.fromEntries(lenient.choices)
		},
		strict: stale ? NOTHING_KNOWN(true) : lenient,
		lenient,
		stale
	};
}

export type AnalysisFamily = 'identity' | 'reply';

export interface AnalysisRequest {
	family: AnalysisFamily;
	input: string;
	request: DecisionRequest;
	aboutIds: Record<string, string>;
	choiceKeys: Record<string, string>;
}

interface Condition {
	id: string;
	text: string;
	rules: string[];
}

function conditionsIn(groups: CategoryGroup[]): Condition[] {
	const byId = new Map<string, Condition>();
	for (const rule of markQueries({ categoryGroups: groups }))
		for (const text of aboutTexts(rule)) {
			const id = conditionId(text);
			const condition = byId.get(id) ?? { id, text, rules: [] };
			condition.rules.push(rule);
			byId.set(id, condition);
		}
	return [...byId.values()];
}

const conditionMatters = (condition: Condition, facts: SubjectFacts, me: string, now: number) => {
	const ruleFacts = { ...subjectRuleFacts(facts, me), now };
	const nothingKnown = NOTHING_KNOWN(true);
	return condition.rules.some((rule) => queryTri(rule, ruleFacts, nothingKnown, []) !== false);
};

function identityRequest(
	facts: SubjectFacts,
	me: string,
	groups: CategoryGroup[],
	current: Analysis | null,
	now: number
): AnalysisRequest | null {
	const input = identityInputOf(facts);
	const known = current?.identityInput === input ? current : null;
	const questions: Record<string, DecisionQuestion> = {};
	const aboutIds: Record<string, string> = {};
	const choiceKeys: Record<string, string> = {};
	for (const condition of conditionsIn(groups)) {
		if (known?.about[condition.id] !== undefined || !conditionMatters(condition, facts, me, now))
			continue;
		const key = `${ABOUT_PREFIX}${condition.id}`;
		questions[key] = aboutQuestion(condition.text);
		aboutIds[key] = condition.id;
	}
	for (const choice of groupChoices(groups)) {
		if (known?.choices[choice.key] !== undefined) continue;
		const key = `${CHOICE_PREFIX}${choice.key}`;
		questions[key] = choiceQuestion(choice.options);
		choiceKeys[key] = choice.key;
	}
	if (!Object.keys(questions).length) return null;
	return {
		family: 'identity',
		input,
		request: { state: identityInput(facts), questions },
		aboutIds,
		choiceKeys
	};
}

function replyRequest(
	facts: SubjectFacts,
	me: string,
	current: Analysis | null
): AnalysisRequest | null {
	const input = replyInputOf(facts, me);
	const known = current?.replyInput === input ? current : null;
	const questions: Record<string, DecisionQuestion> = {};
	if (known?.reply === undefined && replyFromOthers(facts, me))
		questions[REPLY] = replyQuestion(me);
	if (known?.urgency === undefined) questions[URGENCY] = URGENCY_QUESTION;
	if (!Object.keys(questions).length) return null;
	return {
		family: 'reply',
		input,
		request: { state: replyInput(facts, me), questions },
		aboutIds: {},
		choiceKeys: {}
	};
}

export function analysisRequests(
	analysis: Analysis | null,
	facts: SubjectFacts,
	me: string,
	groups: CategoryGroup[],
	version: string,
	now: number
): AnalysisRequest[] {
	const current = analysis?.version === version ? analysis : null;
	return [
		identityRequest(facts, me, groups, current, now),
		replyRequest(facts, me, current)
	].filter((request): request is AnalysisRequest => request !== null);
}

export const currentInputOf = (family: AnalysisFamily, facts: SubjectFacts, me: string) =>
	family === 'identity' ? identityInputOf(facts) : replyInputOf(facts, me);

const emptyAnalysis = (version: string): Analysis => ({
	version,
	replyInput: null,
	identityInput: null,
	about: {},
	choices: {}
});

export function mergeAnalysis(
	previous: Analysis | null,
	version: string,
	asked: AnalysisRequest,
	answers: DecisionAnswers
): Analysis | null {
	const base = previous?.version === version ? previous : emptyAnalysis(version);
	if (asked.family === 'reply') {
		const reply = noulOf(answers[REPLY]);
		const urgency = scoreOf(answers[URGENCY]);
		if (reply === undefined && urgency === undefined) return null;
		const kept =
			base.replyInput === asked.input ? base : { ...base, reply: undefined, urgency: undefined };
		return withoutUndefined({
			...kept,
			replyInput: asked.input,
			reply: reply ?? kept.reply,
			urgency: urgency ?? kept.urgency
		});
	}
	const about: Record<string, number> = {};
	const choices: Record<string, string> = {};
	for (const [key, id] of Object.entries(asked.aboutIds)) {
		const p = noulOf(answers[key]);
		if (p !== undefined) about[id] = p;
	}
	for (const [key, choiceKey] of Object.entries(asked.choiceKeys)) {
		const choice = choiceOf(answers[key]);
		if (choice) choices[choiceKey] = choice.id;
	}
	if (!Object.keys(about).length && !Object.keys(choices).length) return null;
	const same = base.identityInput === asked.input;
	return {
		...base,
		identityInput: asked.input,
		about: { ...(same ? base.about : {}), ...about },
		choices: { ...(same ? base.choices : {}), ...choices }
	};
}

const withoutUndefined = (analysis: Analysis): Analysis =>
	Object.fromEntries(
		Object.entries(analysis).filter(([, value]) => value !== undefined)
	) as Analysis;
